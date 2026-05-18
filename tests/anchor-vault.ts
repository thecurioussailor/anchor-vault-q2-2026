import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AnchorVaultQ22026 } from "../target/types/anchor_vault_q2_2026";
import { Commitment, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { BN } from "bn.js";
import { expect } from "chai";

const commitment = "confirmed";

describe("anchor_vault", ()=>{
    const confirmTx = async (signature: string) => {
        const latestBlockhash = await anchor.getProvider().connection.getLatestBlockhash();
        await anchor.getProvider().connection.confirmTransaction(
            {
                signature,
                ...latestBlockhash
            },
            commitment
        );
    };

    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.AnchorVaultQ22026 as Program<AnchorVaultQ22026>;

    const user = provider.wallet.publicKey;

    //Derive PDAs
    const [vaultStatePda, stateBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), user.toBuffer()], 
        program.programId
    );

    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), vaultStatePda.toBuffer()],
        program.programId
    )

    before(async () => {
        const sig = await provider.connection.requestAirdrop(user, 10* LAMPORTS_PER_SOL);
        await confirmTx(sig)
    })

    it("Initialize the vault", async () => {
        const tx = await program.methods.initialize().accountsStrict({
            user: user,
            vaultState: vaultStatePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId
        })
        .rpc();

        await confirmTx(tx);

        const vaultState = await program.account.vaultState.fetch(vaultStatePda);
        expect(vaultState.vaultBump).to.equal(vaultBump);
        expect(vaultState.stateBump).to.equal(stateBump);
    })

    it("Deposit 1 Sol in to the vault", async () => {
        const depositAmount = 1 * LAMPORTS_PER_SOL;

        const initialVaultBalance = await provider.connection.getBalance(vaultPda);
        const initialUserBalance = await provider.connection.getBalance(user);

        const tx = await program.methods.deposit(new BN(depositAmount)).accountsStrict({
            user: user,
            vaultState: vaultStatePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId
        })
        .rpc();

        confirmTx(tx);

        const finalBalanceVault = await provider.connection.getBalance(vaultPda);
        const finalBalanceUser = await provider.connection.getBalance(user);

        expect(finalBalanceVault).to.be.equal(initialVaultBalance + depositAmount);
        expect(finalBalanceUser).to.be.lessThan(initialUserBalance - depositAmount);
    })

    it("Withdraw 0.5 sol from the vault", async () => {
        const withdrawAmount = 0.5 * LAMPORTS_PER_SOL;

        const initialVaultBalance = await provider.connection.getBalance(vaultPda);
        const intialUserBalance = await provider.connection.getBalance(user);

        const tx = await program.methods.withdraw(new BN(withdrawAmount)).accountsStrict({
            user: user,
            vaultState: vaultStatePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId
        })
        .rpc();

        confirmTx(tx);

        const finalBalanceVault = await provider.connection.getBalance(vaultPda);
        const finalBalanceUser = await provider.connection.getBalance(user);

        expect(finalBalanceVault).to.equal(initialVaultBalance - withdrawAmount);
        expect(finalBalanceUser).to.be.greaterThan(intialUserBalance);
    })

    it("Close the vault and withdraw all the funds", async () => {
        const initialUserBalance = await provider.connection.getBalance(user);

        const tx = await program.methods.close().accountsStrict({
            user: user,
            vaultState: vaultStatePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId
        })
        .rpc();

        confirmTx(tx);

        expect(await provider.connection.getBalance(vaultPda)).to.equal(0);

        const vaultStateInfo = await provider.connection.getAccountInfo(vaultStatePda);
        expect(vaultStateInfo).to.be.null;

        const finalUserBalance = await provider.connection.getBalance(user);
        expect(finalUserBalance).to.be.greaterThan(initialUserBalance);
    })
})