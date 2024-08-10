import axios from "axios"
import {program} from "commander"
import {runProgram} from "@subsquid/util-internal"
import {OutDir} from "@subsquid/util-internal-code-printer"
import {HASURA_METADATA_API_URL, CONFIG_DIR, hasuraHttpHeaders} from "./common"
//import {registerTsNodeIfRequired} from '@subsquid/util-internal-ts-node'


runProgram(async () => {
    program.description('Analyze the current database state and generate a Hasura configuration that tracks all available tables and foreign key relationships')

//    await registerTsNodeIfRequired()

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

    const dir = new OutDir(CONFIG_DIR)
    let outIdx = 0
    dir.del()

    for (let table of res.data) {
        if (table.name === 'migrations' || table.schema !== 'public') continue

        const trackTableQuery = {
            type: 'pg_track_table',
            args: {
                source: 'default',
                table: table.name,
                configuration: {}
            }
        }

        const outIdxLabel = `${outIdx}`.padStart(5, '0')
        const outFileName = `${outIdxLabel}-pg_track_table-${table.name}.json`
        outIdx += 1

        dir.write(outFileName, JSON.stringify(trackTableQuery, null, 2))
    }
})
