/**
 * Transaction Logger for ZKP Voting System
 * 
 * This utility logs blockchain transactions in real-time without BigInt issues.
 * Import and use this in your frontend components to see what's being sent to the blockchain.
 */

// Helper function to safely convert BigInt values to strings
const safeStringify = (obj) => {
  return JSON.stringify(obj, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
};

// Main transaction logger class
class TransactionLogger {
  constructor(options = {}) {
    this.options = {
      logLevel: options.logLevel || 'info', // 'debug', 'info', 'warn', 'error'
      showProofs: options.showProofs || false,
      colorize: options.colorize !== undefined ? options.colorize : true,
      ...options
    };
    
    // Keep track of transactions for later analysis
    this.transactions = [];
    
    // Bind methods
    this.logTransaction = this.logTransaction.bind(this);
    this.logEvent = this.logEvent.bind(this);
    this.interceptWeb3Provider = this.interceptWeb3Provider.bind(this);
  }

  /**
   * Log a transaction before it's sent to the blockchain
   * @param {Object} tx The transaction object
   * @param {string} description Optional description of the transaction
   */
  logTransaction(tx, description = '') {
    if (!tx) return;

    // Store transaction for later analysis
    this.transactions.push({
      ...tx,
      timestamp: new Date().toISOString(),
      description
    });

    // Format transaction for console output
    const formattedTx = {
      from: tx.from,
      to: tx.to,
      value: tx.value ? tx.value.toString() : '0',
      gasLimit: tx.gas ? tx.gas.toString() : 'default',
      method: this._extractMethodName(tx.data || tx.input),
      description
    };

    // Add decoded parameters if possible
    try {
      if (tx.data || tx.input) {
        const params = this._decodeTransactionData(tx.data || tx.input);
        if (params) {
          formattedTx.params = params;
        }
      }
    } catch (err) {
      formattedTx.decodeError = err.message;
    }

    // Log to console
    if (this.options.colorize) {
      console.group('%c🔗 Blockchain Transaction', 'color: #3498db; font-weight: bold;');
      console.log('%cTransaction Details:', 'font-weight: bold;');
      console.log(formattedTx);
      
      if (description) {
        console.log('%cDescription:', 'font-weight: bold;', description);
      }
      
      console.log('%cRaw Transaction:', 'color: #7f8c8d;', safeStringify(tx));
      console.groupEnd();
    } else {
      console.log('🔗 BLOCKCHAIN TRANSACTION');
      console.log('Transaction Details:', formattedTx);
      if (description) {
        console.log('Description:', description);
      }
      console.log('Raw Transaction:', safeStringify(tx));
    }

    return formattedTx;
  }

  /**
   * Log a contract event
   * @param {Object} event The event object
   * @param {string} description Optional description of the event
   */
  logEvent(event, description = '') {
    if (!event) {
      console.warn('Attempted to log undefined event');
      return;
    }

    // Format event for console output
    const formattedEvent = {
      event: event.event || 'Unknown Event',
      blockNumber: event.blockNumber ? event.blockNumber.toString() : 'pending',
      transactionHash: event.transactionHash || 'pending',
      returnValues: {}
    };

    // Convert BigInt values in returnValues
    if (event.returnValues) {
      Object.keys(event.returnValues || {}).forEach(key => {
        if (isNaN(parseInt(key))) { // Skip numeric keys (duplicates in web3 events)
          const value = event.returnValues[key];
          formattedEvent.returnValues[key] = typeof value === 'bigint' ? value.toString() : value;
        }
      });
    } else if (event.args) {
      // Handle ethers.js events which use args instead of returnValues
      formattedEvent.returnValues = {};
      Object.keys(event.args || {}).forEach(key => {
        if (isNaN(parseInt(key))) {
          const value = event.args[key];
          formattedEvent.returnValues[key] = typeof value === 'bigint' ? value.toString() : value;
        }
      });
    }

    // Log to console
    if (this.options.colorize) {
      console.group('%c📢 Contract Event', 'color: #9b59b6; font-weight: bold;');
      console.log('%cEvent Details:', 'font-weight: bold;');
      console.log(formattedEvent);
      
      if (description) {
        console.log('%cDescription:', 'font-weight: bold;', description);
      }
      
      console.groupEnd();
    } else {
      console.log('📢 CONTRACT EVENT');
      console.log('Event Details:', formattedEvent);
      if (description) {
        console.log('Description:', description);
      }
    }

    return formattedEvent;
  }

  /**
   * Intercept a web3 provider to log all transactions
   * @param {Object} web3 The Web3 instance
   * @returns {Object} The intercepted Web3 instance
   */
  interceptWeb3Provider(web3) {
    if (!web3) {
      console.error('Invalid Web3 or provider instance provided');
      return web3;
    }

    // For ethers.js provider
    if (web3.provider && typeof web3.provider.on === 'function') {
      const self = this;
      
      // Listen for transaction events
      web3.provider.on('pending', (tx) => {
        self.logTransaction(tx, 'Pending Transaction');
      });
      
      // Listen for new blocks
      web3.provider.on('block', (blockNumber) => {
        console.log(`New block: ${blockNumber}`);
      });
      
      console.log('🔄 Ethers provider intercepted for transaction logging');
      return web3;
    }
    
    // For web3.js
    if (web3.eth) {
      const originalSendTransaction = web3.eth.sendTransaction;
      const self = this;

      // Override sendTransaction to log transactions
      web3.eth.sendTransaction = function(txObject) {
        self.logTransaction(txObject, 'Web3 sendTransaction');
        return originalSendTransaction.apply(this, arguments);
      };

      // Log when contracts are deployed
      if (web3.eth.Contract && web3.eth.Contract.prototype.deploy) {
        const originalDeploy = web3.eth.Contract.prototype.deploy;
        web3.eth.Contract.prototype.deploy = function(options) {
          const deployObject = originalDeploy.call(this, options);
          const originalSend = deployObject.send;
          
          deployObject.send = function(sendOptions) {
            self.logTransaction(
              { ...sendOptions, data: options.data }, 
              'Contract Deployment'
            );
            return originalSend.call(this, sendOptions);
          };
          
          return deployObject;
        };
      }

      // Log contract method calls
      if (web3.eth.Contract && web3.eth.Contract.prototype._executeMethod) {
        const originalContractSend = web3.eth.Contract.prototype._executeMethod;
        web3.eth.Contract.prototype._executeMethod = function() {
          const method = arguments[0];
          const args = arguments[1];
          
          if (method && method.type === 'send' && args && args.arguments) {
            const txData = this.methods[method.name](...args.arguments)
              .encodeABI();
              
            self.logTransaction(
              { ...args.options, to: this._address, data: txData },
              `Contract Method: ${method.name}`
            );
          }
          
          return originalContractSend.apply(this, arguments);
        };
      }

      console.log('🔄 Web3 provider intercepted for transaction logging');
    }
    
    return web3;
  }

  /**
   * Extract method name from transaction data
   * @private
   */
  _extractMethodName(data) {
    if (!data || typeof data !== 'string' || !data.startsWith('0x')) {
      return 'unknown';
    }
    
    // Method ID is the first 4 bytes after 0x
    const methodId = data.slice(0, 10);
    
    // Known method IDs for ZKVotingSystem
    const methodIds = {
      '0x0121b93f': 'vote',
      '0x3057a7e0': 'startVoting',
      '0x88eaa3ab': 'registerVoter',
      '0x3b214a74': 'addCandidate',
      '0x7b3e5e7b': 'endVoting'
    };
    
    return methodIds[methodId] || `unknown (${methodId})`;
  }

  /**
   * Decode transaction data
   * @private
   */
  _decodeTransactionData(data) {
    if (!data || typeof data !== 'string') {
      return null;
    }
    
    // Method ID is the first 4 bytes after 0x
    const methodId = data.slice(0, 10);
    
    // Simple parameter extraction for vote method (0x0121b93f)
    // This is a simplified version - in a real app, use web3.eth.abi.decodeParameters
    if (methodId === '0x0121b93f') { // vote method
      try {
        // Extract candidate ID (first parameter)
        // In the real implementation, this would be properly decoded using ABI
        const candidateIdHex = '0x' + data.slice(10, 74).replace(/^0+/, '');
        const candidateId = parseInt(candidateIdHex);
        
        return {
          candidateId: isNaN(candidateId) ? 'encrypted' : candidateId.toString(),
          nullifierHash: 'present (encrypted)',
          zkProof: this.options.showProofs ? 'present (binary data)' : '[hidden]'
        };
      } catch (e) {
        return { error: 'Failed to decode parameters' };
      }
    }
    
    return { rawData: data.length > 20 ? data.slice(0, 20) + '...' : data };
  }

  /**
   * Get all logged transactions
   */
  getTransactions() {
    return this.transactions;
  }

  /**
   * Clear logged transactions
   */
  clearTransactions() {
    this.transactions = [];
  }
}

// Create a singleton instance
const transactionLogger = new TransactionLogger();

// Export both the class and the singleton instance
export { TransactionLogger, transactionLogger };

// Default export for easy importing
export default transactionLogger; 