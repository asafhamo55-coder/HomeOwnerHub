// Runs before every integration test file. Order matters: env first,
// because application modules capture process.env at import scope.
import { installLocalEnv } from './env'

installLocalEnv()
