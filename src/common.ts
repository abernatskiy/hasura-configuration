import * as dotenv from "dotenv"
import {assertNotNull} from "@subsquid/util-internal"

dotenv.config()

export const HASURA_METADATA_API_URL = 'http://localhost:8080/v1/metadata'

export const CONFIG_DIR = 'hasura/config'

export const hasuraHttpHeaders = {
    'content-type': 'application/json',
    'x-hasura-admin-secret': assertNotNull(
        process.env.HASURA_GRAPHQL_ADMIN_SECRET,
        'please set the HASURA_GRAPHQL_ADMIN_SECRET variable'
    )
}
