import {runProgram} from '@subsquid/util-internal'
//import {OutDir} from "@subsquid/util-internal-code-printer"
//import {registerTsNodeIfRequired} from '@subsquid/util-internal-ts-node'
import {program} from 'commander'
import * as dotenv from 'dotenv'


runProgram(async () => {
    program.description('Analyze the current database state and generate a Hasura configuration that tracks all available tables and foreign key relationships')

//    program.option('-n, --name <name>', 'name suffix for new migration', 'Data')
//    let {name} = program.parse().opts() as {name: string}

    dotenv.config()

//    await registerTsNodeIfRequired()

})
