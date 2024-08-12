import axios from "axios"
import {program} from "commander"
import {runProgram} from "@subsquid/util-internal"
import {OutDir} from "@subsquid/util-internal-code-printer"
import {HASURA_URL, CONFIG_DIR, hasuraHttpHeaders} from "./common"
//import {registerTsNodeIfRequired} from '@subsquid/util-internal-ts-node'


runProgram(async () => {
    program.description('Analyze the current database state and generate a Hasura configuration that tracks all available tables and foreign key relationships').parse()

//    await registerTsNodeIfRequired()

    const tables: TableRecord[] = await getTablesData()
    const relationships: RelationshipRecord[] = await getRelationshipsData()

    const dir = new OutDir(CONFIG_DIR)
    let outIdx = 0
    dir.del()

    outIdx = writeTablesConfiguration(tables, dir, outIdx)
    outIdx = writeRelationshipsConfiguration(relationships, dir, outIdx)
})

type TableRecord = {
    name: string
    schema: string
}

type RelationshipRecord = {
    id: string
    from: string
    field: string
    to: string
    oneToOne: boolean
}

async function getTablesData(): Promise<TableRecord[]> {
    const HASURA_METADATA_API_URL = `${HASURA_URL}/v1/metadata`

    const listTablesQuery = {
        type: 'pg_get_source_tables',
        args: {
            source: 'default'
        }
    }

    const res = await axios.post(
        HASURA_METADATA_API_URL,
        listTablesQuery,
        {
            headers: hasuraHttpHeaders,
            validateStatus: () => true
        }
    )

    if (res.status !== 200) {
        console.error(`Source table listing via ${HASURA_METADATA_API_URL} failed with HTTP ${res.status} ${res.statusText}`, res.data)
        process.exit(1)
    }

    return res.data.filter((t: TableRecord) => t.name !== 'migrations' && t.schema === 'public')
}

async function getRelationshipsData(): Promise<RelationshipRecord[]> {
    const HASURA_SCHEMA_API_URL = `${HASURA_URL}/v2/query`

    const listRelationshipsQuery = {
        type: 'run_sql',
        args: {
            source: 'default',
            sql: `
                SELECT tc.constraint_name,
                    tc.table_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE
                    (
                        tc.constraint_type = 'FOREIGN KEY'
                        OR tc.constraint_type = 'UNIQUE'
                    )
                    AND tc.table_schema = 'public';
            `
        }
    }

    const res = await axios.post(
        HASURA_SCHEMA_API_URL,
        listRelationshipsQuery,
        {
            headers: hasuraHttpHeaders,
            validateStatus: () => true
        }
    )

    if (res.status !== 200) {
        console.error(`Relationship listing via ${HASURA_SCHEMA_API_URL} failed with HTTP ${res.status} ${res.statusText}`, res.data)
        process.exit(1)
    }

    if (res.data.result_type !== 'TuplesOk') {
        console.error(`Unexpected result type received while listing relationships: ${res.data.result_type}`)
        process.exit(1)
    }

    const relationships: Map<string, RelationshipRecord> = new Map()
    for (let fkrec of res.data.result.slice(1)) {
        let [id, from, type, field, to, toField] = fkrec
        if (type !== 'FOREIGN KEY') continue
        if (toField !== 'id') {
            console.error(`Unusual schema detected: foreign key ${id} is pointing to a non-ID field ${toField} of table ${to}. Refusing to operate`)
            process.exit(1)
        }
        relationships.set(`${fkrec[1]}-${fkrec[3]}`, { id, from, field, to, oneToOne: false })
    }
    for (let urec of res.data.result.slice(1)) {
        if (urec[2] !== 'UNIQUE') continue
        const rel = relationships.get(`${urec[1]}-${urec[3]}`)
        if (rel != null) rel.oneToOne = true
    }

    return [...relationships.values()]
}

function writeTablesConfiguration(tables: TableRecord[], outDir: OutDir, startingIdx: number): number {
    for (let table of tables) {
        const trackTableQuery = {
            type: 'pg_track_table',
            args: {
                source: 'default',
                table: table.name,
                configuration: {}
            }
        }

        const outIdxLabel = `${startingIdx}`.padStart(5, '0')
        const outFileName = `${outIdxLabel}-v1%2Fmetadata-${table.name}.json`
        outDir.write(outFileName, JSON.stringify(trackTableQuery, null, 2))
        startingIdx += 1
    }
    return startingIdx
}

function writeRelationshipsConfiguration(constraints: RelationshipRecord[], outDir: OutDir, startingIdx: number): number {
    for (let constraint of constraints) {
        const constraintLabel = `${constraint.from}-${constraint.field}-${constraint.to}`

        const trackForwardRelationshipQuery =
//            constraint.oneToOne ?
            {
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
        startingIdx += 1

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
        startingIdx += 1
    }
    return startingIdx
}
