import {runProgram} from '@subsquid/util-internal'
//import {registerTsNodeIfRequired} from '@subsquid/util-internal-ts-node'
import {program} from 'commander'
import * as dotenv from 'dotenv'


runProgram(async () => {
    program.description('Apply all configuration calls').parse()

    dotenv.config()

//    await registerTsNodeIfRequired()

    console.log('Not implemented')
})
