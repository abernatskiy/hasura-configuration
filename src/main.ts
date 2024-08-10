import {program} from "commander"


program.description('Hasura configuration tool for use with SQD indexers')


program.command('apply', 'applies all configuration calls')
program.command('regenerate', 'creates a set of Hasura API configuration calls that track all available tables and foreign key relationships')
program.parse()
