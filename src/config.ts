import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';

// Keypair ví Phantom (thay bằng khóa bí mật của bạn)
export const owner: Keypair = Keypair.fromSecretKey(bs58.decode('DQGzMDZMrSrNWazwN5kTg7JKCpR3i1eyC7uKeKtJVgfUEUxLB7QQeuiA1mHw7bvXnGqZ2eLBuagZX1cJXKW6Cpv'));

// Kết nối đến Solana devnet
export const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Phiên bản giao dịch (khuyên dùng V0)
export const txVersion = TxVersion.V0;

// Khởi tạo Raydium SDK
let raydium: Raydium | undefined;

/**
 * Khởi tạo Raydium SDK với kết nối và ví được cung cấp.
 * @returns Raydium SDK đã được khởi tạo.
 */
export const initSdk = async () => {
  if (raydium) return raydium;
  console.log('Đang kết nối đến devnet...');
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