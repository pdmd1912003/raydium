import { createMint, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { connection, owner } from './config';

async function createToken() {
  try {
    console.log('Đang kết nối đến devnet...');

    // Tạo keypair cho token mint
    const tokenMintKeypair = Keypair.generate();
    const tokenMintPubkey = tokenMintKeypair.publicKey;

    // Tạo mint account
    console.log('Tạo token mint mới...');
    const mint = await createMint(
      connection,
      owner, // Payer
      owner.publicKey, // Mint authority
      null, // Freeze authority (null để không có)
      9, // Decimals
      tokenMintKeypair, // Mint keypair
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID // Token-2022 Program
    );
    console.log('Token Mint Address:', mint.toBase58());

    // Tạo Associated Token Account (ATA) cho owner
    console.log('Tạo ATA cho owner...');
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

    // Mint 1,000,000,000 token cho ATA
    const mintAmount = 1_000_000_000 * 10 ** 9; // 1 tỷ token, tính theo lamports
    console.log(`Mint ${mintAmount} token đến ATA...`);
    await mintTo(
      connection,
      owner,
      mint,
      tokenATA.address,
      owner.publicKey, // Mint authority
      mintAmount,
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Đã mint ${mintAmount / 10 ** 9} token đến ATA: ${tokenATA.address.toBase58()}`);

    // Kiểm tra số dư
    const tokenAccountInfo = await getAccount(connection, tokenATA.address, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`Số dư ATA: ${tokenAccountInfo.amount.toString()} token`);

    // In thông tin token để sử dụng trong createPool.ts
    console.log('Thông tin token mới để sử dụng:');
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
    console.error('Lỗi khi tạo token:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
}

createToken();