"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import messageArtifact from "./Message.json";

type MessageHistoryItem = {
  updatedBy: string;
  newMessage: string;
  transactionHash: string;
  blockNumber: number;
};


const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CONTRACT_ABI = messageArtifact.abi;

// Hardhat local node. Reads go straight here, NOT through MetaMask,
// so MetaMask's cached block number can never break them after a node restart.
const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void
      ) => void;
    };
  }
}

let readProvider: JsonRpcProvider | undefined;

function getReadProvider() {
  if (!readProvider) {
    readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, {
      staticNetwork: true,
    });
  }
  return readProvider;
}

// Throws a readable error if nothing is deployed at CONTRACT_ADDRESS.
async function getReadContract() {
  const provider = getReadProvider();
  const code = await provider.getCode(CONTRACT_ADDRESS);

  if (code === "0x") {
    throw new Error(
      "No contract found at this address. Is `hardhat node` running? Redeploy, then update CONTRACT_ADDRESS."
    );
  }

  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

function errorText(error: unknown, fallback: string) {
  const e = error as {
    code?: string;
    shortMessage?: string;
    message?: string;
    error?: { message?: string };
  };

  if (e?.code === "ACTION_REJECTED") return "Transaction rejected in MetaMask.";
  if (e?.error?.message) return e.error.message;
  if (e?.shortMessage) return e.shortMessage;
  if (e?.message) return e.message;
  return fallback;
}

export default function Home() {
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [message, setMessage] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastEvent, setLastEvent] = useState("");

  const [history, setHistory] = useState<MessageHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");


  const readMessage = useCallback(async () => {
    try {
      setStatus("Reading message from blockchain...");

      const contract = await getReadContract();
      const currentMessage: string = await contract.getMessage();

      setMessage(currentMessage);
      setStatus("Message loaded successfully.");
    } catch (error) {
      console.error(error);
      setStatus(
        errorText(
          error,
          "Could not read message. Check that the Hardhat node is running."
        )
      );
    }
  }, []);

  // Load message, owner and history, then listen for new updates.
  useEffect(() => {
    let cancelled = false;
    let contract: Contract | undefined;


    const handleMessageUpdated = (
      updatedBy: string,
      updatedMessage: string,
      event: {
        log: {
          transactionHash: string;
          blockNumber: number;
        };
      }
    ) => {
      if (cancelled) return;

      const transactionHash = event.log.transactionHash;
      const blockNumber = event.log.blockNumber;

      setMessage(updatedMessage);
      setLastEvent(`Updated by ${updatedBy} — Message: ${updatedMessage}`);

      setHistory((previous) => {
        if (
          previous.some(
            (item) => item.transactionHash === transactionHash
          )
        ) {
          return previous;
        }

        return [
          {
            updatedBy,
            newMessage: updatedMessage,
            transactionHash,
            blockNumber,
          },
          ...previous,
        ];
      });
    };


    async function init() {
      await readMessage();

      try {
        setHistoryLoading(true);
        setHistoryError("");

        const readContract = await getReadContract();
        contract = readContract;

        setOwner(String(await readContract.owner()));


        const latestBlock = await getReadProvider().getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 999);

        // No address filter: include events from every wallet.
        const messageUpdatedFilter = readContract.filters.MessageUpdated();

        const events = await readContract.queryFilter(
          messageUpdatedFilter,
          fromBlock,
          latestBlock
        );


        const historyItems: MessageHistoryItem[] = events.flatMap((event) => {
          if (!("args" in event)) return [];

          return [
            {
              updatedBy: String(event.args[0]),
              newMessage: String(event.args[1]),
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
            },
          ];
        });

        if (!cancelled) setHistory(historyItems.reverse());

        await readContract.on(
          messageUpdatedFilter,
          handleMessageUpdated
        );

        if (cancelled) {
          await readContract.off(
            messageUpdatedFilter,
            handleMessageUpdated
          );
        }

      } catch (error) {
        console.error("Could not load history:", error);
        if (!cancelled) setHistoryError(errorText(error, "Could not load history."));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (contract) {
        void contract.off("MessageUpdated", handleMessageUpdated);
      }
    };
  }, [readMessage]);

  // Pick up an already-connected MetaMask account and follow account switches.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setAccount(list[0]);
      })
      .catch(() => { });

    const handleAccountsChanged = (...args: unknown[]) => {
      const list = (args[0] as string[]) ?? [];
      setAccount(list[0] ?? "");
    };

    ethereum.on?.("accountsChanged", handleAccountsChanged);


    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setStatus("Please install MetaMask first.");
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);

      setAccount(accounts[0] as string);
      setStatus("Wallet connected.");
    } catch (error) {
      console.error(error);
      setStatus(errorText(error, "Could not connect wallet. Please try again."));
    }
  }

  async function updateMessage() {
    if (!newMessage.trim()) {
      setStatus("Please enter a message first.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Waiting for transaction approval...");

      if (!window.ethereum) {
        throw new Error("MetaMask is not installed.");
      }

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== BigInt(CHAIN_ID)) {
        throw new Error(
          `MetaMask is on the wrong network. Switch to the Hardhat network (chain ID ${CHAIN_ID}).`
        );
      }

      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Ask the Hardhat node (not MetaMask) for the real nonce, so a stale
      // MetaMask nonce after a node restart can't cause "Nonce too high".
      const nonce = await getReadProvider().getTransactionCount(
        await signer.getAddress(),
        "pending"
      );

      const transaction = await contract.updateMessage(newMessage.trim(), {
        nonce,
      });

      setStatus("Transaction submitted. Waiting for confirmation...");
      await transaction.wait();

      setMessage(newMessage.trim());
      setNewMessage("");
      setStatus("Message updated successfully on the blockchain.");
    } catch (error) {
      console.error(error);
      setStatus(errorText(error, "Transaction failed or was rejected."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
            Web3 • Solidity • Next.js
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Message dApp
          </h1>

          <p className="mt-4 text-slate-400">
            Read and update a message stored on a blockchain.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <button
            onClick={connectWallet}
            className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold transition hover:bg-violet-500"
          >
            {account
              ? `${account.slice(0, 6)}...${account.slice(-4)}`
              : "Connect MetaMask"}
          </button>

          <div className="my-8 rounded-xl border border-slate-800 bg-slate-950 p-5">
            <p className="text-sm text-slate-400">Current blockchain message</p>

            <p className="mt-3 break-words text-xl font-medium">
              {message || "No message loaded yet."}
            </p>

            <button
              onClick={readMessage}
              className="mt-5 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Read Message
            </button>
          </div>

          <label
            htmlFor="newMessage"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Enter a new message
          </label>

          <textarea
            id="newMessage"
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="Type your message..."
            rows={3}
            maxLength={500}
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-violet-500"
          />

          <button
            onClick={updateMessage}
            disabled={busy || !account || !newMessage.trim()}
            className="mt-4 w-full rounded-xl bg-white px-5 py-3 font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Processing..." : "Update Message"}
          </button>


          <div
            aria-live="polite"
            className="mt-5 rounded-lg bg-slate-950 p-4 text-sm text-slate-300"
          >
            <span className="font-semibold text-violet-400">Status: </span>
            {status || "Connect your wallet to get started."}
          </div>
        </section>

        <p className="mt-6 break-all text-center text-xs text-slate-500">
          Local contract: {CONTRACT_ADDRESS}
        </p>

        {lastEvent && (
          <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
            <p className="text-sm font-semibold text-violet-300">
              Latest Blockchain Event
            </p>

            <p className="mt-2 break-words text-sm text-slate-300">
              {lastEvent}
            </p>
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Message History</h2>

          <p className="mt-2 text-sm text-slate-400">
            Previous message updates recorded on the blockchain.
          </p>

          {historyLoading ? (
            <p className="mt-6 text-slate-400">Loading message history...</p>
          ) : historyError ? (
            <p className="mt-6 text-red-400">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="mt-6 text-slate-400">No message-update events found.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-700 text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Message</th>
                    <th className="px-3 py-3">Updated By</th>
                    <th className="px-3 py-3">Block</th>
                    <th className="px-3 py-3">Transaction</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => (
                    <tr
                      key={item.transactionHash}
                      className="border-b border-slate-800"
                    >
                      <td className="max-w-48 break-words px-3 py-4">
                        {item.newMessage}
                      </td>

                      <td className="px-3 py-4">
                        <span title={item.updatedBy}>
                          {item.updatedBy.slice(0, 6)}...
                          {item.updatedBy.slice(-4)}
                        </span>
                      </td>

                      <td className="px-3 py-4">{item.blockNumber}</td>

                      <td className="px-3 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.transactionHash);
                            setStatus("Transaction hash copied to clipboard.");
                          }}
                          className="text-violet-400 hover:text-violet-300 underline underline-offset-4"
                          title={`Copy transaction hash: ${item.transactionHash}`}
                        >
                          {item.transactionHash.slice(0, 10)}...
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
