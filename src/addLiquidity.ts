import { ApiV3Token, Percent } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { initSdk, connection, owner, txVersion } from './config';
import { PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

/**
 * Attempt to add liquidity to activate a Raydium CPMM pool.
 */
export const addLiquidity = async () => {
  try {
    const raydium = await initSdk();
    console.log('Connecting to devnet...');

    // Define token mints
    const mintA: ApiV3Token = {
      address: 'So11111111111111111111111111111111111111112', // WSOL
      decimals: 9,
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      chainId: 101,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      symbol: 'WSOL',
      name: 'Wrapped SOL',
      extensions: {},
      tags: ['wrapped-sol'],
    };
    const mintB: ApiV3Token = {
      address: '97s64f6cs9YoqFcV8XuwJfudtv1KDxtEiDvv9ebPWJzZ', // Custom token
      decimals: 9,
      programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      chainId: 101,
      logoURI: '',
      symbol: 'CUSTOM',
      name: 'Custom Token',
      extensions: {},
      tags: [],
    };

    // Current pool ID
    const poolId = new PublicKey('98Cy88utRUYei2LXw2ZL1tdRKGNLDydRdNekWGVcvqaV');

    // Fetch pool information
    console.log('Fetching pool info from Pool ID:', poolId.toBase58());
    const pool = await raydium.cpmm.getPoolInfoFromRpc(poolId.toString());
    if (!pool || pool.poolInfo.type !== 'Standard') {
      throw new Error('CPMM pool not found with Pool ID: ' + poolId.toBase58());
    }
    console.log('Pool info:', JSON.stringify(pool, null, 2));

    // Add authority to poolInfo.config
    const poolInfo = {
      ...pool.poolInfo,
      config: {
        ...pool.poolInfo.config,
        authority: pool.poolKeys.authority,
      },
    };

    // Check initial liquidity
    if (new BN(pool.rpcData.baseReserve, 16).isZero() || new BN(pool.rpcData.quoteReserve, 16).isZero()) {
      throw new Error('Pool has no initial liquidity (baseReserve or quoteReserve is zero).');
    }
    console.log('Pool status before adding liquidity:', pool.rpcData.status);

    // Check and create Associated Token Accounts (ATAs)
    const mintAPubkey = new PublicKey(mintA.address);
    const mintBPubkey = new PublicKey(mintB.address);
    const ownerPubkey = owner.publicKey;

    const ataA = await getAssociatedTokenAddress(mintAPubkey, ownerPubkey, false, TOKEN_PROGRAM_ID);
    const ataB = await getAssociatedTokenAddress(mintBPubkey, ownerPubkey, false, TOKEN_2022_PROGRAM_ID);

    const transaction = new Transaction();

    // Check ATA for WSOL
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

    // Check ATA for custom token
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

    // Send transaction to create ATA if needed
    if (transaction.instructions.length > 0) {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPubkey;
      const signature = await connection.sendTransaction(transaction, [owner], { skipPreflight: false });
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('ATA(s) created with transaction:', signature);
    }

    // Check token balances
    console.log('Checking token balances...');
    console.log('WSOL ATA:', ataA.toBase58());
    console.log('Custom token ATA:', ataB.toBase58());
    const wsolAccount = await getAccount(connection, ataA, 'confirmed', TOKEN_PROGRAM_ID);
    const customTokenAccount = await getAccount(connection, ataB, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`WSOL ATA balance: ${wsolAccount.amount.toString()} lamports`);
    console.log(`Custom token ATA balance: ${customTokenAccount.amount.toString()} tokens`);

    // Small liquidity amount to attempt activation
    const poolPrice = parseFloat(pool.rpcData.poolPrice); // 0.001
    const inputAmount = new BN(100_000_000); // 0.1 SOL
    const baseIn = true; // WSOL is the base token
    const slippage = new Percent(1, 100); // Slippage 1%

    // Calculate required amount of token B
    const amountB = inputAmount.mul(new BN(Math.round(1 / poolPrice * 1_000_000_000))).div(new BN(1_000_000_000)); // 0.1 SOL * (1/0.001) = 100 custom token
    if (new BN(customTokenAccount.amount).lt(amountB)) {
      throw new Error(`Insufficient custom token balance: ${customTokenAccount.amount.toString()} < ${amountB.toString()}`);
    }

    const solBalance = await connection.getBalance(ownerPubkey, 'confirmed');
    console.log(`Wallet SOL balance: ${solBalance / 1e9} SOL`);
    if (solBalance < 150_000_000) {
      throw new Error(`Insufficient SOL balance: ${solBalance / 1e9} SOL < 0.15 SOL`);
    }

    // Add liquidity
    console.log('Attempting to add liquidity to activate pool:', {
      poolId: poolId.toBase58(),
      inputAmount: inputAmount.toString(),
      amountB: amountB.toString(),
      baseIn,
      slippage: slippage.toFixed(),
    });

    const addLiquidityResult = await raydium.cpmm.addLiquidity({
      poolInfo,
      inputAmount,
      baseIn,
      slippage,
      config: {
        bypassAssociatedCheck: false,
        checkCreateATAOwner: true,
      },
      txVersion,
    });
    console.log('addLiquidity transaction:', JSON.stringify(addLiquidityResult, null, 2));

    const { execute } = addLiquidityResult;

    // Execute transaction
    console.log('Executing liquidity addition transaction...');
    const { txId } = await execute({ sendAndConfirm: true });
    console.log('Liquidity added with txId:', txId);

    // Check pool status after adding liquidity
    const updatedPool = await raydium.cpmm.getPoolInfoFromRpc(poolId.toString());
    console.log('Pool status after adding liquidity:', updatedPool.rpcData.status);

    process.exit(0);
  } catch (error: any) {
    console.error('Error adding liquidity:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
};

// Run the function
addLiquidity();