import { PublicKey } from '@solana/web3.js';
import { initSdk } from './config';
import BN from 'bn.js';

async function checkPool() {
  try {
    const raydium = await initSdk();
    const poolId = new PublicKey('FmyvBJ6Dce3nsqikRBf2stuCq1b94w7nUNHXZKvs41Cq');
    console.log('Pool Info from poolID :', poolId.toBase58());
    const pool = await raydium.cpmm.getPoolInfoFromRpc( poolId.toString());
    console.log('Thông tin pool:', JSON.stringify(pool, null, 2));
    console.log('Pool status:', pool.rpcData.status);
    console.log('Base Reserve:', new BN(pool.rpcData.baseReserve, 16).toString());
    console.log('Quote Reserve:', new BN(pool.rpcData.quoteReserve, 16).toString());
    console.log('Open Time:', new Date(Number(pool.rpcData.openTime) * 1000).toUTCString());
  } catch (error: any) {
    console.error('Error checking pool:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

checkPool();