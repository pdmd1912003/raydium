import { DEVNET_PROGRAM_ID, getCpmmPdaAmmConfigId, ApiV3Token } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { initSdk, connection, owner, txVersion } from './config';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

export const createPool = async () => {
  try {
    const raydium = await initSdk();
    console.log('Using wallet (owner):', owner.publicKey.toBase58());

    const customTokenMint: ApiV3Token = {
      address: 'AUwKNLqwTBVSBiAgV4LKU145PKBMqTzmDTHp5WQSatgZ',
      decimals: 9,
      programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      chainId: 101,
      logoURI: '',
      symbol: 'CUSTOM',
      name: 'Custom Token',
      extensions: {},
      tags: [],
    };

    const WSOLMint: ApiV3Token = {
      address: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      chainId: 101,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      symbol: 'WSOL',
      name: 'Wrapped SOL',
      extensions: {},
      tags: ['wrapped-sol'],
    };

    const customTokenMintPubkey = new PublicKey(customTokenMint.address);
    const wsolMintPubkey = new PublicKey(WSOLMint.address);
    const ownerPubkey = owner.publicKey;

    const customTokenATA = await getAssociatedTokenAddress(customTokenMintPubkey, ownerPubkey, false, TOKEN_2022_PROGRAM_ID);
    const wsolATA = await getAssociatedTokenAddress(wsolMintPubkey, ownerPubkey, false, TOKEN_PROGRAM_ID);

    const transaction = new Transaction();

    const customTokenAccountInfo = await connection.getAccountInfo(customTokenATA);
    if (!customTokenAccountInfo) {
      console.log('Creating ATA for custom token...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          customTokenATA,
          ownerPubkey,
          customTokenMintPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    const wsolAccountInfo = await connection.getAccountInfo(wsolATA);
    if (!wsolAccountInfo) {
      console.log('Creating ATA for WSOL...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          wsolATA,
          ownerPubkey,
          wsolMintPubkey,
          TOKEN_PROGRAM_ID
        )
      );
    }

    if (transaction.instructions.length > 0) {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPubkey;
      const signature = await connection.sendTransaction(transaction, [owner], { skipPreflight: false });
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('ATA(s) created with transaction:', signature);
    }

    console.log('Checking token balances...');
    console.log('Custom token ATA:', customTokenATA.toBase58());
    console.log('WSOL ATA:', wsolATA.toBase58());
    const customTokenAccount = await getAccount(connection, customTokenATA, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const wsolTokenAccount = await getAccount(connection, wsolATA, 'confirmed', TOKEN_PROGRAM_ID);
    console.log(`Custom token ATA balance: ${customTokenAccount.amount.toString()} tokens`);
    console.log(`WSOL ATA balance: ${wsolTokenAccount.amount.toString()} lamports`);

    if (customTokenAccount.amount < 1_000_000) {
      throw new Error(`Insufficient custom token balance: ${customTokenAccount.amount.toString()} < 1000000`);
    }

    const ownerInfo = { useSOLBalance: true };
    if (wsolTokenAccount.amount < 1_000_000_000 && !ownerInfo.useSOLBalance) {
      throw new Error(`Insufficient WSOL balance: ${wsolTokenAccount.amount.toString()} < 1000000000`);
    }

    const solBalance = await connection.getBalance(ownerPubkey, 'confirmed');
    console.log(`Wallet SOL balance: ${solBalance / 1e9} SOL`);
    if (solBalance < 1_100_000_000) {
      throw new Error(`Insufficient SOL balance: ${solBalance / 1e9} SOL < 1.1 SOL`);
    }

    const mintA = new PublicKey(customTokenMint.address);
    const mintB = new PublicKey(WSOLMint.address);
    const isSorted = mintA.toBuffer().compare(mintB.toBuffer()) < 0;
    console.log(`Token pair order: ${isSorted ? 'Correct (mintA < mintB)' : 'Incorrect (mintA > mintB), swapping...'}`);
    const [sortedMintA, sortedMintB, sortedMintAAmount, sortedMintBAmount] = isSorted
      ? [customTokenMint, WSOLMint, new BN(1_000_000), new BN(1_000_000_000)]
      : [WSOLMint, customTokenMint, new BN(1_000_000_000), new BN(1_000_000)];

    const feeConfigs = [
      {
        id: getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, 0).publicKey.toBase58(),
        index: 0,
        protocolFeeRate: 120000,
        tradeFeeRate: 2500,
        fundFeeRate: 40000,
        createPoolFee: '1000000',
      },
    ];

    console.log('Creating pool with parameters:', {
      programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58(),
      poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC.toBase58(),
      mintA: sortedMintA.address,
      mintB: sortedMintB.address,
      mintAAmount: sortedMintAAmount.toString(),
      mintBAmount: sortedMintBAmount.toString(),
      feeConfig: feeConfigs[0],
    });
    const { execute, extInfo } = await raydium.cpmm.createPool({
      programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
      mintA: sortedMintA,
      mintB: sortedMintB,
      mintAAmount: sortedMintAAmount,
      mintBAmount: sortedMintBAmount,
      startTime: new BN(0),
      feeConfig: feeConfigs[0],
      associatedOnly: false,
      ownerInfo,
      txVersion,
    });

    console.log('Executing pool creation transaction...');
    const { txId } = await execute({ sendAndConfirm: true });
    console.log('Pool created with txId:', txId);
    console.log('Pool ID:', extInfo.address.poolId.toBase58());

    process.exit(0);
  } catch (error: any) {
    console.error('Error creating pool:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
};

createPool();
