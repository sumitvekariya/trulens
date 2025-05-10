import React from 'react';
import { useConnect, useAccount, useDisconnect } from '@starknet-react/core';
import type { Connector } from '@starknet-react/core';
import '../styles/WalletConnect.css';

function WalletConnect() {
  const { connect, connectors } = useConnect();
  const { account, address, status } = useAccount();
  const { disconnect } = useDisconnect();

  if (status === 'connected' && account) {
    return (
      <div className="wallet-connect-container">
        <div className="connected-account">
          <span className="account-badge">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Account not available'}
          </span>
          <button 
            className="wallet-button disconnect-button" 
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-connect-container">
      {connectors.map((connector: Connector) => (
        <button 
          key={connector.id} 
          onClick={() => connect({ connector })}
          disabled={!connector.available()}
          className={`wallet-button ${!connector.available() ? 'disabled' : ''}`}
        >
          Connect {connector.name}
          {!connector.available() && " (not available)"}
        </button>
      ))}
      {connectors.filter(c => c.available()).length === 0 && (
        <p className="wallet-not-found">No wallets found or available. Please install a Starknet wallet like Argent X or Braavos.</p>
      )}
    </div>
  );
}

export default WalletConnect; 