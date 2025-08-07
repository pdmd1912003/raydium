import { ApiV3Token, Percent } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { initSdk, connection, owner, txVersion } from './config';
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createSyncNativeInstruction,
} from '@solana/spl-token';

/**
 * Add liquidity to Raydium CPMM pool using SOL from Phantom wallet by wrapping it into WSOL.
 */
export const addLiquidity = async () => {
  try {
    const raydium = await initSdk();
    const mintA: ApiV3Token = {
      address: 'So11111111111111111111111111111111111111112', // WSOL
      decimals: 9,
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      chainId: 101,
      symbol: 'WSOL',
      name: 'Wrapped SOL',
      logoURI: '',
      extensions: {},
      tags: ['wrapped-sol'],
    };
    const mintB: ApiV3Token = {
      address: 'AUwKNLqwTBVSBiAgV4LKU145PKBMqTzmDTHp5WQSatgZ', // Custom Token
      decimals: 9,
      programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      chainId: 101,
      symbol: 'CUSTOM',
      name: 'Custom Token',
      logoURI: '',
      extensions: {},
      tags: [],
    };

    const poolId = new PublicKey('FmyvBJ6Dce3nsqikRBf2stuCq1b94w7nUNHXZKvs41Cq');
    const pool = await raydium.cpmm.getPoolInfoFromRpc(poolId.toString());

    if (!pool || pool.poolInfo.type !== 'Standard') {
      throw new Error('CPMM pool not found.');
    }
    console.log('=== Original pool info ===');
    console.dir(pool.poolInfo, { depth: null });

    console.log('=== Pool keys ===');
    console.dir(pool.poolKeys, { depth: null });

    console.log('=== Checking authority ===');
    console.log('pool.poolKeys.authority:', pool.poolKeys?.authority || 'undefined');

    if (!pool.poolKeys?.authority) {
      throw new Error('Pool authority is undefined.');
    }

    const poolInfo = {
      ...pool.poolInfo,
      authority: pool.poolKeys.authority,
      config: {
        ...pool.poolInfo.config,
      },
    };

    console.log('=== Built poolInfo object ===');
    console.dir(poolInfo, { depth: null });

    if (new BN(pool.rpcData.baseReserve, 16).isZero() || new BN(pool.rpcData.quoteReserve, 16).isZero()) {
      throw new Error('Pool has no initial liquidity.');
    }

    const mintAPubkey = new PublicKey(mintA.address); // WSOL
    const mintBPubkey = new PublicKey(mintB.address); // CUSTOM
    const ownerPubkey = owner.publicKey;

    const ataA = await getAssociatedTokenAddress(mintAPubkey, ownerPubkey, false, TOKEN_PROGRAM_ID); // WSOL ATA
    const ataB = await getAssociatedTokenAddress(mintBPubkey, ownerPubkey, false, TOKEN_2022_PROGRAM_ID); // CUSTOM ATA

    const transaction = new Transaction();
    const inputAmount = new BN(100_000_000); // 0.1 SOL
    const baseIn = true;
    const slippage = new Percent(1, 100); // 1%

    const ataAInfo = await connection.getAccountInfo(ataA);
    if (!ataAInfo) {
      console.log('Creating ATA for WSOL...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          ataA,
          ownerPubkey,
          mintAPubkey,
          TOKEN_PROGRAM_ID
        )
      );
    }

    const ataBInfo = await connection.getAccountInfo(ataB);
    if (!ataBInfo) {
      console.log('Creating ATA for custom token...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          ataB,
          ownerPubkey,
          mintBPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    console.log(`Wrapping ${inputAmount.toNumber() / 1e9} SOL into WSOL...`);
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: ownerPubkey,
        toPubkey: ataA,
        lamports: inputAmount.toNumber(),
      }),
      createSyncNativeInstruction(ataA)
    );

    if (transaction.instructions.length > 0) {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPubkey;
      const txId = await connection.sendTransaction(transaction, [owner]);
      await connection.confirmTransaction(txId, 'confirmed');
      console.log('WSOL + ATA setup transaction sent:', txId);
    }

    const wsolAccount = await getAccount(connection, ataA, 'confirmed', TOKEN_PROGRAM_ID);
    const customTokenAccount = await getAccount(connection, ataB, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`WSOL balance: ${wsolAccount.amount.toString()} lamports`);
    console.log(`Custom Token balance: ${customTokenAccount.amount.toString()}`);

    const poolPrice = parseFloat(pool.rpcData.poolPrice);
    const multiplier = 2;
    const amountB = inputAmount
      .mul(new BN(Math.round(1 / poolPrice * 1_000_000_000)))
      .div(new BN(1_000_000_000))
      .mul(new BN(multiplier));

    console.log(`Required CUSTOM token amount: ${amountB.toString()} lamports (${amountB.toNumber() / 1e9} CUSTOM)`);

    if (new BN(customTokenAccount.amount).lt(amountB)) {
      throw new Error(`Not enough CUSTOM tokens: ${customTokenAccount.amount.toString()} < ${amountB.toString()}`);
    }

    const solBalance = await connection.getBalance(ownerPubkey, 'confirmed');
    if (solBalance < 0.05 * 1e9) {
      throw new Error('Not enough SOL to cover transaction fees.');
    }

    console.log('Sending add liquidity transaction...');
    const addLiquidityResult = await raydium.cpmm.addLiquidity({
      poolInfo,
      poolKeys: pool.poolKeys,
      inputAmount,
      baseIn,
      slippage,
      config: {
        bypassAssociatedCheck: false,
        checkCreateATAOwner: true,
      },
      txVersion,
    });

    const { execute } = addLiquidityResult;
    const { txId } = await execute({ sendAndConfirm: true });
    console.log('Liquidity added! TxId:', txId);

    const updatedPool = await raydium.cpmm.getPoolInfoFromRpc(poolId.toString());
    console.log('Updated pool status:', updatedPool.rpcData.status);
  } catch (error: any) {
    console.error('Error while adding liquidity:', error.message);
    if (error.logs) console.error('Logs:', error.logs);
    process.exit(1);
  }
};

addLiquidity();
