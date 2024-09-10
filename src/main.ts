import {program} from "commander"
import {CONFIG_PATH} from "./common"


program.description('Hasura configuration tool for use with SQD indexers')


program.command('apply', `Apply the configuration at ${CONFIG_PATH}`)
program.command('regenerate', `Analyze TypeORM models and generate a Hasura configuration at ${CONFIG_PATH} that tracks all related tables and foreign key relationships`)
program.parse()
