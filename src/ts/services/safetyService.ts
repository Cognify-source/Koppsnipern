// safetyService.ts í utvecklingsläge

// SafetyService med modulära rug checks, handling batch-RPC, latensy per check, blockering av ogiltiga nyckelar och blockloggning

import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadataWarnings } from '../../utils/tokenMetadataUtils';


// ... rest of filen as innan...