export const EXPECTED_CHAIN_ID = 31337;

export async function checkWalletNetwork(
  provider: { getNetwork: () => Promise<{ chainId: bigint }> }
): Promise<boolean> {
  const network = await provider.getNetwork();

  return network.chainId === BigInt(EXPECTED_CHAIN_ID);
}
