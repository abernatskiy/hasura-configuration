import assert from "assert"
import fs from "fs"
import {program} from "commander"
import inquirer from "inquirer"
import {getMetadataArgsStorage} from "typeorm"
import {MetadataArgsStorage} from "typeorm/metadata-args/MetadataArgsStorage"
import {RelationTypeInFunction} from "typeorm/metadata/types/RelationTypeInFunction"
import {runProgram} from "@subsquid/util-internal"
import {toSnakeCase} from "@subsquid/util-naming"
import {registerTsNodeIfRequired, isTsNode} from "@subsquid/util-internal-ts-node"
import {CONFIG_PATH} from "./common"
import baseHasuraConfig from "./baseConfig.json"

const HASURA_GRAPHQL_UNAUTHORIZED_ROLE = process.env.HASURA_GRAPHQL_UNAUTHORIZED_ROLE ?? 'public'

runProgram(async () => {
    program.description(`Analyze TypeORM models and generate a Hasura configuration at ${CONFIG_PATH} that tracks all related tables and foreign key relationships`)
    program.option('-f, --force', `do not prompt before overwriting ${CONFIG_PATH}`, false)

    const {force} = program.parse().opts() as {force: boolean}

    await registerTsNodeIfRequired()

    validateBaseConfig(baseHasuraConfig)

    // Required for getMetadataArgsStorage() to work
    const modelPath =
        isTsNode() ?
        `${process.cwd()}/src/model/index.ts` :
        `${process.cwd()}/lib/model/index.js`
    // @ts-ignore
    const model = await import(modelPath)

    const typeormMetadata: MetadataArgsStorage = getMetadataArgsStorage()

    const tables: string[] = getTablesData(typeormMetadata)
    const relationships: RelationshipRecord[] = getRelationshipsData(typeormMetadata)

    let hasuraTables = makeHasuraTablesConfig(tables)
    hasuraTables = updateHasuraTablesWithRelationshipsConfig(hasuraTables, relationships)
    hasuraTables = updateHasuraTablesWithPermissionsConfig(hasuraTables)

    let hasuraConfig = baseHasuraConfig as any
    try {
        hasuraConfig.metadata.sources[0].tables = hasuraTables
    }
    catch (e) {
        console.error(`Failed to assign the generated config to the default config field`, e)
        process.exit(1)
    }

    if (fs.existsSync(CONFIG_PATH) && !force) {
        const { confirm } = await inquirer.prompt([
            {
                name: 'confirm',
                type: 'confirm',
                message: `Hasura config file ${CONFIG_PATH} exists. Do you want to overwrite it?`,
                default: false
            }
        ])
        if (!confirm) process.exit(0)
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(hasuraConfig, null, '  '))
})


function validateBaseConfig(config: any): void {
    assert(config.metadata !== undefined, `Base config must have a "metadata" field`)
    assert(Array.isArray(config.metadata.sources), `Base config field "metadata.sources" must be an array`)
    assert(config.metadata.sources[0].name === 'default', `The first source in the base metadata config must be "default"`)
}


type RelationshipRecord = {
    from: string
    field: string
    to: string
    oneToOne: boolean
}


function getTablesData(metadata: MetadataArgsStorage): string[] {
    return metadata.tables.map(t => tableName(t.target))
}


function tableName(entityTarget: string | Function): string {
    if (typeof entityTarget === 'string') {
        return entityTarget
    }
    else {
        return toSnakeCase(entityTarget.name)
    }
}


function getRelationshipsData(metadata: MetadataArgsStorage): RelationshipRecord[] {
    const out: RelationshipRecord[] = []
    for (let rel of metadata.relations) {
        // relationships marked as one-to-many are derived and should be ignored here
        if (rel.relationType === 'many-to-one') {
            out.push({
                from: tableName(rel.target),
                field: `${rel.propertyName}_id`,
                to: typeToTableName(rel.type),
                oneToOne: false
            })
        }
        // relationships with defined .inverseSideProperty are derived and should be ignored here
        if (rel.relationType === 'one-to-one' && rel.inverseSideProperty === undefined) {
            out.push({
                from: tableName(rel.target),
                field: `${rel.propertyName}_id`,
                to: typeToTableName(rel.type),
                oneToOne: true
            })
        }
    }
    return out
}


function typeToTableName(rtype: RelationTypeInFunction): string {
    try {
        let callableType: any = rtype
        let tableName = callableType().name
        assert(tableName)
        return toSnakeCase(tableName as string)
    }
    catch (e) {
        console.error(`Non-callable type returned by TypeORM for a relation, or the value returned by the call has no "name" field`, e, rtype)
        process.exit(1)
    }
}


function makeHasuraTablesConfig(tables: string[]): any[] {
    return tables.map(t => ({table: {name: t, schema: 'public'}}))
}


function updateHasuraTablesWithRelationshipsConfig(hasuraTables: any[], relationships: RelationshipRecord[]): any[] {
    const arrayRelationships: Map<string, any[]> = new Map()
    const objectRelationships: Map<string, any[]> = new Map()
    for (let rel of relationships) {
        if (rel.oneToOne) {
            updateArrayMap(objectRelationships, rel.from, {
                name: rel.to,
                using: {
                    foreign_key_constraint_on: rel.field
                }
            })
            updateArrayMap(objectRelationships, rel.to, {
                name: rel.from,
                using: {
                    foreign_key_constraint_on: {
                        column: rel.field,
                        table: {
                            name: rel.from,
                            schema: 'public'
                        }
                    }
                }
            })
        }
        else {
            updateArrayMap(objectRelationships, rel.from, {
                name: rel.to,
                using: {
                    foreign_key_constraint_on: rel.field
                }
            })
            updateArrayMap(arrayRelationships, rel.to, {
                name: rel.from.concat('s'),
                using: {
                    foreign_key_constraint_on: {
                        column: rel.field,
                        table: {
                            name: rel.from,
                            schema: 'public'
                        }
                    }
                }
            })
        }
    }

    return hasuraTables.map(t => {
        const tname = t.table.name
        if (arrayRelationships.has(tname)) {
            t.array_relationships = arrayRelationships.get(tname)
        }
        if (objectRelationships.has(tname)) {
            t.object_relationships = objectRelationships.get(tname)
        }
        return t
    })
}


function updateArrayMap<T>(m: Map<string, T[]>, key: string, value: T): void {
    if (m.has(key)) {
        m.get(key)!.push(value)
    }
    else {
        m.set(key, [value])
    }
}

function updateHasuraTablesWithPermissionsConfig(hasuraTables: any[]): any[] {
    return hasuraTables.map(t => ({
        ...t,
        select_permissions: [
            {
                role: HASURA_GRAPHQL_UNAUTHORIZED_ROLE,
                permission: {
                    columns: "*",
                    filter: {},
                    allow_aggregations: true
                }
            }
        ]
    }))
}
