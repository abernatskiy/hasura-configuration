import * as dotenv from "dotenv"
import {assertNotNull} from "@subsquid/util-internal"


dotenv.config()


export const CONFIG_PATH = 'hasura_metadata.json'


export const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? 'http://localhost:8080'


export function getHasuraHttpHeaders() {
    return {
        'content-type': 'application/json',
        'x-hasura-role': 'admin',
        'x-hasura-admin-secret': assertNotNull(
            process.env.HASURA_GRAPHQL_ADMIN_SECRET,
            'please set the HASURA_GRAPHQL_ADMIN_SECRET variable'
        ) as string
	}
}
