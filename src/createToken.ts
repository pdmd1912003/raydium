import { createMint, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { connection, owner } from './config';

async function createToken() {
  try {
    console.log('Connecting to devnet...');

    const tokenMintKeypair = Keypair.generate();
    const tokenMintPubkey = tokenMintKeypair.publicKey;

    console.log('Creating new token mint...');
    const mint = await createMint(
      connection,
      owner,
      owner.publicKey,
      null,
      9,
      tokenMintKeypair,
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log('Token Mint Address:', mint.toBase58());

    console.log('Creating ATA for owner...');
    const tokenATA = await getOrCreateAssociatedTokenAccount(
      connection,
      owner,
      mint,
      owner.publicKey,
      false,
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log('Token ATA Address:', tokenATA.address.toBase58());

    const mintAmount = 1_000_000_000 * 10 ** 9;
    console.log(`Minting ${mintAmount} tokens to ATA...`);
    await mintTo(
      connection,
      owner,
      mint,
      tokenATA.address,
      owner.publicKey,
      mintAmount,
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Successfully minted ${mintAmount / 10 ** 9} tokens to ATA: ${tokenATA.address.toBase58()}`);

    const tokenAccountInfo = await getAccount(connection, tokenATA.address, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`ATA balance: ${tokenAccountInfo.amount.toString()} tokens`);

    console.log('New token info for createPool.ts:');
    console.log({
      address: mint.toBase58(),
      decimals: 9,
      programId: TOKEN_2022_PROGRAM_ID.toBase58(),
      chainId: 101,
      logoURI: '',
      symbol: 'NEWTOKEN',
      name: 'New Token',
      extensions: {},
      tags: [],
    });

    process.exit(0);
  } catch (error: any) {
    console.error('Error creating token:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
}

createToken();
