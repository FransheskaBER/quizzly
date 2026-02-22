import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

// In test mode ANTHROPIC_API_KEY is optional — falls back to empty string.
// The Anthropic client is mocked in all test suites so it is never called.
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? '' });

export default anthropic;
