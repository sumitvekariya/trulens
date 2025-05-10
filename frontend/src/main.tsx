import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { StarknetConfig, argent, braavos } from '@starknet-react/core'
import type { Connector } from '@starknet-react/core'
import { sepolia } from '@starknet-react/chains'
import { jsonRpcProvider } from '@starknet-react/core'

// Define a function to create a JSON RPC provider for Sepolia
const rpc = () => ({
  nodeUrl: `https://free-rpc.nethermind.io/sepolia-juno/v0_8` // Your Sepolia RPC
})

const connectors: Connector[] = [
  argent(),
  braavos(),
  // You can also add injected({ id: 'my_other_wallet_id' })
]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarknetConfig
      chains={[sepolia]} // Define the chains your dApp supports
      provider={jsonRpcProvider({ rpc })} // Configure the JSON RPC provider
      connectors={connectors}
      // explorer={starkscan} // Optional: add a default explorer
    >
      <App />
    </StarknetConfig>
  </StrictMode>,
)
