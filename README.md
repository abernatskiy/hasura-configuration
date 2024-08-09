# @abernatskiy/hasura-configuration

A tool for configuring Hasura to track all database tables and foreign key relationships. The resulting configuration can be edited before applying.

Intended to be used with [SQD indexers](https://docs.subsquid.io/sdk).

## Usage

```bash
# 1. Install
npm i @abernatskiy/hasura-configuration

# 2. List available commands
npx squid-hasura-configuration --help
```

```
apply           applies all configuration calls
regenerate      creates a set of Hasura API configuration calls that track
                all available tables and foreign key relationships
```

## Rules

* All configuration calls are defined as JSON files and placed at `hasura/configuration` 
* Hasura connection settings are picked from `HASURA_*` environment variables.
