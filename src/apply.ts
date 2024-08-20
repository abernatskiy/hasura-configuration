import fs from "fs"
import axios from "axios"
import {program} from "commander"
import {runProgram} from "@subsquid/util-internal"
import {registerTsNodeIfRequired} from '@subsquid/util-internal-ts-node'
import {HASURA_URL, CONFIG_DIR, hasuraHttpHeaders} from "./common"

runProgram(async () => {
    program.description('Apply all configuration calls').parse()

    await registerTsNodeIfRequired()

    const queryData: ({filename: string, endpoint: string, query: string} | undefined)[] = Array()
    for (let filename of fs.readdirSync(CONFIG_DIR)) {
        const idx = Number(filename.split('-')[0])
        const endpoint = '/'.concat(filename.split('-')[1].split('%2F').join('/'))
        queryData[idx] = {
            filename,
            endpoint,
            query: fs.readFileSync(`${CONFIG_DIR}/${filename}`).toString('utf-8')
        }
    }

    for (let qdata of queryData) {
        if (qdata === undefined) continue

        process.stdout.write(`Applying ${qdata.filename} ... `)
        const res = await axios.post(
            `${HASURA_URL}${qdata.endpoint}`,
            qdata.query,
            {
                headers: hasuraHttpHeaders,
                validateStatus: () => true
            }
        )

        if (res.status === 200) {
            process.stdout.write('OK\n')
        } else {
            process.stdout.write(`${res.status}: ${res.data.error}\n`)
        }
    }
})
