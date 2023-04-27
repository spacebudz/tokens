import { Contract } from "../mod.ts";
import { Assets, Emulator, generateSeedPhrase, Lucid } from "../../../deps.ts";
import { assertNotEquals } from "https://deno.land/std@0.145.0/testing/asserts.ts";

async function generateAccount(assets: Assets) {
  const seedPhrase = generateSeedPhrase();
  return {
    seedPhrase,
    address: await (await Lucid.new(undefined, "Custom"))
      .selectWalletFromSeed(seedPhrase).wallet.address(),
    assets,
  };
}

const ACCOUNT_0 = await generateAccount({ lovelace: 30000000000n });
const ACCOUNT_1 = await generateAccount({ lovelace: 75000000000n });

const emulator = new Emulator([ACCOUNT_0, ACCOUNT_1]);

const lucid = await Lucid.new(emulator);

lucid.selectWalletFromSeed(ACCOUNT_0.seedPhrase);

const { instanceId } = await new Contract(lucid).deploy();

emulator.awaitBlock();

Deno.test("Start", async () => {
  await new Contract(lucid, instanceId).start([{
    address: ACCOUNT_1.address,
    amount: 50000000n,
  }]);
  emulator.awaitBlock();
});

Deno.test("Mint", async () => {
  const minted = [];
  for (let i = 0; i < 10; i++) {
    const { id } = await new Contract(lucid, instanceId).mint();
    minted.push(id);
    emulator.awaitBlock();
  }
  assertNotEquals(minted, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

Deno.test("Mint and burn", async () => {
  const contract = new Contract(lucid, instanceId);
  const { id } = await contract.mint();
  emulator.awaitBlock();
  await contract.burn(id);
  emulator.awaitBlock();
});

// Deno.test("Destroy all lanes", async () => {
//   const contract = new Contract(lucid, instanceId);
//   for (let i = 0; i < 7; i++) {
//     await contract.destroyLanes();
//     emulator.awaitBlock();
//   }
// });

// Deno.test("Destroy payment utxo", async () => {
//   const contract = new Contract(lucid, instanceId);
//   await contract.destroyPayment();
//   emulator.awaitBlock();
// });
