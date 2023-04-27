# Non-fungbile token (NFT) mass

Mint a large NFT collection of arbitrary size in a serverless, scalable, open and transparent way. Note right now it's limited to only 10k collections, so your supply needs to be exactly 10,000.
This is just a proof of concept at the moment, however it works! Be careful when using in production.

## Requirements

- [Deno](https://deno.land/) $\ge$ Version 1.28.3
- [Aiken](https://github.com/aiken-lang/aiken.git) (`cargo install --git https://github.com/aiken-lang/aiken.git --rev 8b11844282bd32d0693fddb896488bacfd06cdf1`)

## Get started

1. Clone repo and go to directory:
```
git clone https://github.com/spacebudz/tokens.git && cd tokens/nft/mass
```

2. Place your metadata in `metadata.json` (Note as explained aboved the metadata need to contain exactly 10,000 entries).

3. Generate data for merkle trees (This allows us to efficiently verify the metadata on-chain without having to bring a lot of data on the chain in the first place):
```
deno task gen
```
This will output a file `merkle_data.gen.json`

4. Create a file `mint.ts` in the current directory:

```ts
import { Contract } from "./mod.ts";
import {
  Blockfrost,
  Lucid,
} from "https://deno.land/x/lucid@0.10.2/mod.ts";

const lucid = await Lucid.new(
  new Blockfrost(
    "https://cardano-preprod.blockfrost.io/api/v0",
    "<project_id>",
  ),
  "Preprod",
);

// Select your preferred wallet method
lucid.selectWalletFromSeed(
  "<seed_phrase>",
);

const { instanceId, txHash } = await new Contract(lucid).deploy();
console.log("Instance id:" instanceId);
console.log("Tx hash:" txHash)
```
Then run:
```
deno run -A ./mint.ts
```

5. Start the mint for everyone and provide your payment details, basically how much you want to charge for each minted NFT (you can use the same file from above, just make sure you comment out the deploy() part):

```ts
const contract = new Contract(lucid, instanceId);

const txHash = await contract.start([{ address: "addr...", amount: 50000000n }]);
```

6. Mint!
```ts
const contract = new Contract(lucid, instanceId);

const {id, txHash} = await contract.mint();
```
Anyone could call the mint endpoint. All they need is the `instance id` and `metadata.json` file so that they can instantiate the contract correctly on their end.
Additionally this could also be bundled conveniently into an NPM package with `deno task build`. Then the only thing someone needs is the `instance id`.

## Lifecycle

After calling the `deploy()` endpoint 100 UTxOs are put on-chain to allow for minting in a scalable way (UTxO parallelism). When the entire collection is minted those UTxOs can be destroyed again.
The same is true for the `payment` UTxO, which holds your payment details as well as the plutus script that was used for minting.

Claiming back some ADA and cleaning up the chain doesn't hurt!

```ts
const contract = new Contract(lucid, instanceId);

// This needs to be called a few times. Only 15 lanes/UTxOs can be destroyed per tx.
const txHash = await contract.destroyLanes();
// ... await confirmation
const txHash = await contract.destroyLanes();
// ...

const txHash = await contract.destroyPayment();
```

## Limitations/Considerations

- As mentioned aboved right now it works only for 10k collections. But this should be an easy fix.
- Less lanes (the initial deployed UTxOs for parallelism) are available towards the end, because some of them will reach their max supply prior to others. Pseudo randomness ensures you cannot just pick any lane you want. Initially this is not an issue, but when less lanes are available and the mint demand is low then it's getting harder for someone to mint any still available NFT. As long as the demand is high this shouldn't be an issue.