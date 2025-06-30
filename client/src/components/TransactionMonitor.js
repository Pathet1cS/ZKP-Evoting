import React, { useEffect, useState } from 'react';
import { transactionLogger } from '../utils/transactionLogger';

/**
 * TransactionMonitor Component
 * 
 * This component integrates with the transaction logger to display
 * real-time blockchain transactions in the UI.
 * 
 * Usage:
 * 1. Import and add this component to your app
 * 2. It will automatically capture and display transactions
 */
const TransactionMonitor = ({ web3, contract, showInConsole = true, showInUI = false }) => {
  const [transactions, setTransactions] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);

  // Initialize the transaction logger
  useEffect(() => {
    if (web3 && showInConsole) {
      // Intercept the web3 provider to log all transactions
      transactionLogger.interceptWeb3Provider(web3);
      
      // Listen for contract events if contract is provided
      if (contract) {
        if (contract.events) {
          // Web3.js style contract
          try {
            contract.events.allEvents()
              .on('data', (event) => {
                transactionLogger.logEvent(event);
                
                // Update UI if showing in UI
                if (showInUI) {
                  setTransactions(prev => [
                    {
                      type: 'event',
                      data: event,
                      timestamp: new Date().toISOString()
                    },
                    ...prev
                  ]);
                }
              })
              .on('error', console.error);
          } catch (error) {
            console.warn("Could not set up web3.js event listeners:", error.message);
          }
        } else if (typeof contract.on === 'function') {
          // Ethers.js style contract
          try {
            // Set up listeners for common voting events
            const eventNames = [
              'VoteCast',
              'VoterRegistered',
              'CandidateAdded',
              'VotingStarted',
              'VotingEnded',
              'Commit'
            ];
            
            // Listen for specific events
            eventNames.forEach(eventName => {
              contract.on(eventName, (...args) => {
                // The last argument is the event object
                const event = args[args.length - 1];
                const formattedEvent = {
                  event: eventName,
                  blockNumber: event.blockNumber?.toString() || 'pending',
                  transactionHash: event.transactionHash || event.hash || 'pending',
                  args: event.args || {}
                };
                
                transactionLogger.logEvent(formattedEvent);
                
                if (showInUI) {
                  setTransactions(prev => [
                    {
                      type: 'event',
                      data: formattedEvent,
                      timestamp: new Date().toISOString()
                    },
                    ...prev
                  ]);
                }
              });
            });
            
            // Also listen for generic events
            contract.on('*', (event) => {
              if (!event) return;
              
              transactionLogger.logEvent(event);
              
              if (showInUI) {
                setTransactions(prev => [
                  {
                    type: 'event',
                    data: event,
                    timestamp: new Date().toISOString()
                  },
                  ...prev
                ]);
              }
            });
            
            console.log('🔄 Ethers.js event listeners set up successfully');
          } catch (error) {
            console.warn("Could not set up ethers.js event listeners:", error.message);
          }
        }
      }
      
      console.log('🔍 Transaction monitoring enabled');
    }
  }, [web3, contract, showInConsole, showInUI]);

  // Subscribe to transaction logger updates for UI
  useEffect(() => {
    if (!showInUI) return;
    
    // Create a custom hook into the transaction logger
    const originalLogTransaction = transactionLogger.logTransaction;
    transactionLogger.logTransaction = (tx, description) => {
      // Call the original method
      const result = originalLogTransaction.call(transactionLogger, tx, description);
      
      // Update our state
      setTransactions(prev => [
        {
          type: 'transaction',
          data: tx,
          description,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
      
      return result;
    };
    
    // Cleanup
    return () => {
      transactionLogger.logTransaction = originalLogTransaction;
    };
  }, [showInUI]);

  // Don't render anything if not showing in UI
  if (!showInUI) {
    return null;
  }

  // Format transaction for display
  const formatTransaction = (tx) => {
    if (tx.type === 'event') {
      // Handle different event formats (web3.js vs ethers.js)
      const eventName = tx.data.event || 'Unknown Event';
      const blockNumber = tx.data.blockNumber || 'pending';
      const txHash = tx.data.transactionHash || tx.data.hash || 'pending';
      
      // Get event data from either returnValues (web3) or args (ethers)
      const eventData = tx.data.returnValues || tx.data.args || {};
      
      return {
        title: `Event: ${eventName}`,
        details: [
          { label: 'Block', value: blockNumber?.toString() || 'pending' },
          { label: 'Transaction', value: txHash?.substring(0, 10) + '...' || 'N/A' },
          { 
            label: 'Data', 
            value: Object.keys(eventData)
              .filter(key => isNaN(parseInt(key))) // Filter out numeric keys
              .map(key => {
                const value = eventData[key];
                return `${key}: ${typeof value === 'bigint' ? value.toString() : value}`;
              })
              .join(', ') || 'No data'
          }
        ]
      };
    } else {
      // Regular transaction
      const method = tx.data.method || transactionLogger._extractMethodName(tx.data.data || tx.data.input || '');
      return {
        title: `Transaction: ${method || 'Unknown'}`,
        details: [
          { label: 'From', value: tx.data.from?.substring(0, 10) + '...' || 'N/A' },
          { label: 'To', value: tx.data.to?.substring(0, 10) + '...' || 'N/A' },
          { label: 'Description', value: tx.description || 'No description' }
        ]
      };
    }
  };

  // Styling for the monitor
  const styles = {
    container: {
      position: 'fixed',
      bottom: isMinimized ? '10px' : '50%',
      right: '10px',
      width: isMinimized ? '200px' : '400px',
      maxHeight: isMinimized ? '40px' : '50%',
      backgroundColor: '#f8f9fa',
      border: '1px solid #ddd',
      borderRadius: '4px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      zIndex: 1000
    },
    header: {
      backgroundColor: '#3498db',
      color: 'white',
      padding: '8px 12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer'
    },
    body: {
      padding: isMinimized ? '0' : '10px',
      maxHeight: isMinimized ? '0' : 'calc(100% - 40px)',
      overflowY: 'auto',
      transition: 'all 0.3s ease'
    },
    transaction: {
      backgroundColor: 'white',
      border: '1px solid #eee',
      borderRadius: '4px',
      padding: '8px 12px',
      marginBottom: '8px'
    },
    title: {
      fontWeight: 'bold',
      marginBottom: '4px'
    },
    detail: {
      display: 'flex',
      fontSize: '12px',
      marginBottom: '2px'
    },
    label: {
      fontWeight: 'bold',
      marginRight: '8px',
      minWidth: '80px'
    },
    value: {
      wordBreak: 'break-all'
    },
    button: {
      backgroundColor: '#3498db',
      color: 'white',
      border: 'none',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      marginRight: '4px'
    },
    timestamp: {
      fontSize: '10px',
      color: '#999',
      marginTop: '4px',
      textAlign: 'right'
    },
    expandButton: {
      marginLeft: '8px',
      cursor: 'pointer',
      userSelect: 'none'
    }
  };

  return (
    <div style={styles.container}>
      <div 
        style={styles.header} 
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div>🔍 Transaction Monitor {transactions.length > 0 && `(${transactions.length})`}</div>
        <div>
          {isMinimized ? '▲' : '▼'}
        </div>
      </div>
      
      <div style={styles.body}>
        <div style={{ marginBottom: '10px' }}>
          <button 
            style={styles.button}
            onClick={() => setTransactions([])}
          >
            Clear
          </button>
          <button 
            style={styles.button}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
        
        {transactions.length === 0 && (
          <div style={{ padding: '10px', color: '#666' }}>
            No transactions captured yet. Interact with the contract to see transactions here.
          </div>
        )}
        
        {transactions.map((tx, index) => {
          const formatted = formatTransaction(tx);
          return (
            <div key={index} style={styles.transaction}>
              <div style={styles.title}>{formatted.title}</div>
              
              {(isExpanded || index === 0) && formatted.details.map((detail, i) => (
                <div key={i} style={styles.detail}>
                  <div style={styles.label}>{detail.label}:</div>
                  <div style={styles.value}>{detail.value}</div>
                </div>
              ))}
              
              {!isExpanded && index !== 0 && (
                <div style={styles.expandButton} onClick={(e) => {
                  e.stopPropagation();
                  setTransactions(prev => {
                    const newTx = [...prev];
                    newTx[index] = { ...newTx[index], expanded: !newTx[index].expanded };
                    return newTx;
                  });
                }}>
                  {tx.expanded ? 'Hide Details' : 'Show Details'}
                </div>
              )}
              
              {tx.expanded && !isExpanded && index !== 0 && formatted.details.map((detail, i) => (
                <div key={i} style={styles.detail}>
                  <div style={styles.label}>{detail.label}:</div>
                  <div style={styles.value}>{detail.value}</div>
                </div>
              ))}
              
              <div style={styles.timestamp}>
                {new Date(tx.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionMonitor; 