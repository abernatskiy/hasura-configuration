import fs from "fs"
import axios from "axios"
import {program} from "commander"
import {runProgram} from "@subsquid/util-internal"
import {registerTsNodeIfRequired} from "@subsquid/util-internal-ts-node"
import {CONFIG_PATH, HASURA_GRAPHQL_ENDPOINT, getHasuraHttpHeaders} from "./common"


const HASURA_HTTP_HEADERS = getHasuraHttpHeaders()


runProgram(async () => {
    program.description(`Apply the configuration at ${CONFIG_PATH}`).parse()

    await registerTsNodeIfRequired()

    const config: any = JSON.parse(fs.readFileSync(CONFIG_PATH).toString())
    const hasuraApiUrl: string = `${HASURA_GRAPHQL_ENDPOINT}/v1/metadata`

    await axios.post(
        hasuraApiUrl,
        {
            type: 'replace_metadata',
            version: 2,
            args: config
        },
        {
            headers: HASURA_HTTP_HEADERS,
            validateStatus: () => true
        }
    )
    .then(res => {
        if (res.status === 200) {
            console.log('Hasura configuration replaced successfully')
        }
        else {
            console.error(`Got HTTP ${res.status}: ${res.data.error}`)
            if (res.data.error === 'cannot continue due to inconsistent metadata') {
                console.error('Hint: this can be caused by database schema not being up to date')
            }
        }
    })
    .catch(e => {
        if (e.code === 'ECONNREFUSED') {
            console.error(`Could not connect to Hasura at ${hasuraApiUrl}`)
        }
        else {
            console.error(`Unknown Axios error`, e)
        }
    })
})
