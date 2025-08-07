import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';

export const owner: Keypair = Keypair.fromSecretKey(
  bs58.decode('DQGzMDZMrSrNWazwN5kTg7JKCpR3i1eyC7uKeKtJVgfUEUxLB7QQeuiA1mHw7bvXnGqZ2eLBuagZX1cJXKW6Cpv')
);

export const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;

export const initSdk = async () => {
  if (raydium) return raydium;
  console.log('Connecting to devnet...');
  raydium = await Raydium.load({
    connection,
    owner,
    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: 'finalized',
  });
  return raydium;
};
