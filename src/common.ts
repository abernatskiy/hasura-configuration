import * as dotenv from "dotenv"
import {assertNotNull} from "@subsquid/util-internal"

dotenv.config()

export const HASURA_URL = 'http://localhost:8080'

export const CONFIG_DIR = 'hasura/config'

export const hasuraHttpHeaders = {
    'content-type': 'application/json',
    'x-hasura-role': 'admin',
    'x-hasura-admin-secret': assertNotNull(
        process.env.HASURA_GRAPHQL_ADMIN_SECRET,
        'please set the HASURA_GRAPHQL_ADMIN_SECRET variable'
    )
}
