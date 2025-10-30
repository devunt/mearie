import { NapiCli } from '@napi-rs/cli';

const cli = new NapiCli();

await cli.createNpmDirs({});
await cli.artifacts({});
await cli.prePublish({ ghRelease: false, skipOptionalPublish: true });
