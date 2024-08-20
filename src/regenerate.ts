import assert from "assert"
import axios from "axios"
import {program} from "commander"
import {getMetadataArgsStorage} from "typeorm"
import {MetadataArgsStorage} from "typeorm/metadata-args/MetadataArgsStorage"
import {RelationTypeInFunction} from "typeorm/metadata/types/RelationTypeInFunction"
import {runProgram} from "@subsquid/util-internal"
import {toSnakeCase} from "@subsquid/util-naming"
import {OutDir} from "@subsquid/util-internal-code-printer"
import {CONFIG_DIR} from "./common"
import {registerTsNodeIfRequired, isTsNode} from '@subsquid/util-internal-ts-node'

const OUT_FILE_IDX_INCREMENT = 10

runProgram(async () => {
    program.description('Analyze TypeORM models and generate a Hasura configuration that tracks all related tables and foreign key relationships').parse()

    await registerTsNodeIfRequired()

    // Required for getMetadataArgsStorage() to work
    const modelPath =
        isTsNode() ?
        `${process.cwd()}/lib/model/index.ts` :
        `${process.cwd()}/lib/model/index.js`
    // @ts-ignore
    const model = await import(modelPath)

    const typeormMetadata: MetadataArgsStorage = getMetadataArgsStorage()

    const tables: string[] = getTablesData(typeormMetadata)
    const relationships: RelationshipRecord[] = getRelationshipsData(typeormMetadata)

    const dir = new OutDir(CONFIG_DIR)
    let outIdx = OUT_FILE_IDX_INCREMENT
    dir.del()

    outIdx = writeTablesConfiguration(tables, dir, outIdx)
    outIdx = writeRelationshipsConfiguration(relationships, dir, outIdx)
})


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
        console.error(`Non-callable type returned by TypeORM for a relation`, e, rtype)
        process.exit(1)
    }
}


function writeTablesConfiguration(tables: string[], outDir: OutDir, startingIdx: number): number {
    for (let table of tables) {
        const trackTableQuery = {
            type: 'pg_track_table',
            args: {
                source: 'default',
                table: table,
                configuration: {}
            }
        }

        const outIdxLabel = `${startingIdx}`.padStart(5, '0')
        const outFileName = `${outIdxLabel}-v1%2Fmetadata-${table}.json`
        outDir.write(outFileName, JSON.stringify(trackTableQuery, null, 2))
        startingIdx += OUT_FILE_IDX_INCREMENT
    }
    return startingIdx
}


function writeRelationshipsConfiguration(constraints: RelationshipRecord[], outDir: OutDir, startingIdx: number): number {
    for (let constraint of constraints) {
        const constraintLabel = `${constraint.from}-${constraint.field}-${constraint.to}`

        const trackForwardRelationshipQuery = {
            type: 'pg_create_object_relationship',
            args: {
                table: constraint.from,
                name: constraint.to,
                source: 'default',
                using: {
                    foreign_key_constraint_on: constraint.field
                }
            }
        }
        let outIdxLabel = `${startingIdx}`.padStart(5, '0')
        let outFileName = `${outIdxLabel}-v1%2Fmetadata-${constraintLabel}-fwd.json`
        outDir.write(outFileName, JSON.stringify(trackForwardRelationshipQuery, null, 2))
        startingIdx += OUT_FILE_IDX_INCREMENT

        const trackBackwardRelationshipQuery =
            constraint.oneToOne ?
            {
                type: 'pg_create_object_relationship',
                args: {
                    table: constraint.to,
                    name: constraint.from,
                    source: 'default',
                    using: {
                        foreign_key_constraint_on: {
                            table: constraint.from,
                            columns: constraint.field
                        }
                    }
                }
            } :
            {
                type: 'pg_create_array_relationship',
                args: {
                    table: constraint.to,
                    name: constraint.from.concat('s'),
                    source: 'default',
                    using: {
                        foreign_key_constraint_on: {
                            table: constraint.from,
                            columns: constraint.field
                        }
                    }
                }
            }
        outIdxLabel = `${startingIdx}`.padStart(5, '0')
        outFileName = `${outIdxLabel}-v1%2Fmetadata-${constraintLabel}-bwd.json`
        outDir.write(outFileName, JSON.stringify(trackBackwardRelationshipQuery, null, 2))
        startingIdx += OUT_FILE_IDX_INCREMENT
    }
    return startingIdx
}
