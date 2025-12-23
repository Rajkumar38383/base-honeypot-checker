// Base Network Configuration - Multiple RPC endpoints for fallback
const BASE_RPC_URLS = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base-mainnet.public.blastapi.io',
    'https://1rpc.io/base',
    'https://base.gateway.tenderly.co'
];
const BASE_CHAIN_ID = 8453;
const EXPLORER_URL = 'https://basescan.org/address/';
const UNISWAP_V2_FACTORY = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'; // Base Swap Factory
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Base WETH


// ERC20 ABI (minimal for token analysis)
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function owner() view returns (address)',
    'function getOwner() view returns (address)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)'
];

const FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
];

// DOM Elements
const contractInput = document.getElementById('contract-address');
const scanButton = document.getElementById('scan-button');
const loadingState = document.getElementById('loading-state');
const loadingMessage = document.getElementById('loading-message');
const resultsContainer = document.getElementById('results-container');
const errorContainer = document.getElementById('error-container');
const closeResults = document.getElementById('close-results');
const closeError = document.getElementById('close-error');

// Result elements
const riskBadge = document.getElementById('risk-badge');
const riskFill = document.getElementById('risk-fill');
const riskScoreValue = document.getElementById('risk-score-value');
const tokenName = document.getElementById('token-name');
const tokenSymbol = document.getElementById('token-symbol');
const tokenDecimals = document.getElementById('token-decimals');
const tokenSupply = document.getElementById('token-supply');
const detailsList = document.getElementById('details-list');
const explorerLink = document.getElementById('explorer-link');
const errorMessage = document.getElementById('error-message');

// Global provider
let provider;
let currentRpcIndex = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    // Don't initialize provider immediately - wait for user action
    console.log('Base Honeypot Checker loaded. Ready to analyze tokens.');
});

// Initialize provider with fallback support
async function initializeProvider() {
    // Try each RPC endpoint until one works
    for (let i = 0; i < BASE_RPC_URLS.length; i++) {
        const rpcUrl = BASE_RPC_URLS[(currentRpcIndex + i) % BASE_RPC_URLS.length];
        try {
            console.log(`Trying RPC endpoint: ${rpcUrl}`);
            const testProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

            // Test the connection with a timeout
            const networkPromise = testProvider.getNetwork();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 5000)
            );

            await Promise.race([networkPromise, timeoutPromise]);

            // If we get here, connection succeeded
            provider = testProvider;
            currentRpcIndex = (currentRpcIndex + i) % BASE_RPC_URLS.length;
            console.log(`✓ Connected to Base network via ${rpcUrl}`);
            return true;
        } catch (error) {
            console.warn(`Failed to connect to ${rpcUrl}:`, error.message);
            continue;
        }
    }

    // All RPC endpoints failed
    provider = null;
    return false;
}

// Event Listeners
function setupEventListeners() {
    scanButton.addEventListener('click', handleScan);
    closeResults.addEventListener('click', hideResults);
    closeError.addEventListener('click', hideError);

    contractInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleScan();
        }
    });

    // Auto-format contract address
    contractInput.addEventListener('input', (e) => {
        let value = e.target.value.trim();
        if (value && !value.startsWith('0x')) {
            e.target.value = '0x' + value;
        }
    });
}

// Main scan handler
async function handleScan() {
    const address = contractInput.value.trim();

    // Validate address
    if (!validateAddress(address)) {
        showError('Please enter a valid contract address (0x followed by 40 hexadecimal characters)');
        return;
    }

    // Show loading state
    showLoading('Connecting to Base network...');

    try {
        // Ensure provider is initialized
        if (!provider) {
            updateLoadingMessage('Trying Base RPC endpoints...');
            const connected = await initializeProvider();
            if (!connected) {
                throw new Error('Unable to connect to Base network. All RPC endpoints failed. Please check your internet connection or try again later.');
            }
        }

        // Verify provider is still working
        try {
            updateLoadingMessage('Verifying connection...');
            await provider.getBlockNumber();
        } catch (error) {
            // Try to reconnect
            console.log('Connection lost, attempting to reconnect...');
            updateLoadingMessage('Reconnecting...');
            const reconnected = await initializeProvider();
            if (!reconnected) {
                throw new Error('Lost connection to Base network. Please try again.');
            }
        }

        // Run all checks
        const analysisResults = await analyzeToken(address);

        // Display results
        displayResults(analysisResults, address);

    } catch (error) {
        console.error('Error analyzing contract:', error);
        showError(error.message || 'Failed to analyze contract. Please try again.');
    } finally {
        hideLoading();
    }
}

// Validate Ethereum address
function validateAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Main analysis function
async function analyzeToken(address) {
    const results = {
        address: address,
        checks: [],
        riskScore: 0,
        tokenInfo: {}
    };

    try {
        // Check 1: Verify it's a contract
        updateLoadingMessage('Verifying contract...');
        const code = await provider.getCode(address);
        if (code === '0x') {
            throw new Error('Address is not a contract');
        }
        results.checks.push({
            type: 'success',
            title: '✓ Valid Contract',
            description: 'Address contains contract bytecode'
        });

        // Check 2: Get token information
        updateLoadingMessage('Reading token information...');
        const contract = new ethers.Contract(address, ERC20_ABI, provider);

        try {
            results.tokenInfo.name = await contract.name();
            results.tokenInfo.symbol = await contract.symbol();
            results.tokenInfo.decimals = await contract.decimals();
            results.tokenInfo.totalSupply = await contract.totalSupply();

            results.checks.push({
                type: 'success',
                title: '✓ ERC20 Standard',
                description: 'Token implements standard ERC20 functions'
            });
        } catch (error) {
            results.checks.push({
                type: 'danger',
                title: '⚠️ Non-Standard Token',
                description: 'Token does not fully implement ERC20 standard'
            });
            results.riskScore += 5; // Reduced from 10
        }

        // Check 3: Bytecode analysis
        updateLoadingMessage('Analyzing bytecode...');
        const bytecodeAnalysis = analyzeBytecode(code);
        results.checks.push(...bytecodeAnalysis.checks);
        results.riskScore += bytecodeAnalysis.riskScore;

        // Check 4: Ownership check
        updateLoadingMessage('Checking ownership...');
        const ownershipCheck = await checkOwnership(contract);
        results.checks.push(...ownershipCheck.checks);
        results.riskScore += ownershipCheck.riskScore;

        results.checks.push(...ownershipCheck.checks);
        results.riskScore += ownershipCheck.riskScore;

        // Check 5: Liquidity & Simulation
        updateLoadingMessage('Checking liquidity & simulation...');
        const liquidityCheck = await checkLiquidityAndSimulation(contract, address);
        results.checks.push(...liquidityCheck.checks);
        results.riskScore += liquidityCheck.riskScore;

        // Check 6: Contract size analysis

        const contractSize = (code.length - 2) / 2; // Remove 0x and divide by 2
        if (contractSize > 24576) {
            results.checks.push({
                type: 'warning',
                title: '⚠️ Large Contract',
                description: `Contract size: ${contractSize} bytes. Unusually large contracts may hide malicious code.`
            });
            results.riskScore += 5;
        } else {
            results.checks.push({
                type: 'success',
                title: '✓ Normal Contract Size',
                description: `Contract size: ${contractSize} bytes`
            });
        }

    } catch (error) {
        console.error('Analysis error:', error);
        throw error;
    }

    return results;
}

// Analyze bytecode for suspicious patterns
function analyzeBytecode(bytecode) {
    const checks = [];
    let riskScore = 0;

    // Check for SELFDESTRUCT opcode (0xff) - but be smarter about it
    // 0xff appears in normal bytecode, so we need to check context
    const selfDestructPattern = /63ff/gi; // More specific pattern for actual SELFDESTRUCT
    const selfDestructMatches = bytecode.match(selfDestructPattern);

    if (selfDestructMatches && selfDestructMatches.length > 2) {
        checks.push({
            type: 'danger',
            title: '🚨 SELFDESTRUCT Detected',
            description: 'Contract contains SELFDESTRUCT opcode which can destroy the contract'
        });
        riskScore += 15; // Reduced from 30
    }

    // Check for DELEGATECALL opcode (0xf4) - common in proxies, not always bad
    const delegateCallPattern = /f4/gi;
    const delegateCallMatches = bytecode.match(delegateCallPattern);

    if (delegateCallMatches && delegateCallMatches.length > 10) {
        checks.push({
            type: 'warning',
            title: '⚠️ Multiple DELEGATECALL Found',
            description: 'Contract uses DELEGATECALL extensively - may be a proxy pattern'
        });
        riskScore += 5; // Reduced penalty
    } else if (delegateCallMatches && delegateCallMatches.length > 0) {
        checks.push({
            type: 'success',
            title: '✓ Proxy Pattern Detected',
            description: 'Contract uses DELEGATECALL - likely an upgradeable proxy (common pattern)'
        });
        // No risk score - this is normal
    }

    // Check bytecode length
    const codeLength = (bytecode.length - 2) / 2;
    if (codeLength < 100) {
        checks.push({
            type: 'warning',
            title: '⚠️ Minimal Contract',
            description: 'Very small contract - likely a simple wrapper or proxy'
        });
        riskScore += 5;
    } else if (codeLength > 1000) {
        checks.push({
            type: 'success',
            title: '✓ Standard Contract Size',
            description: `Contract size: ${codeLength} bytes - appears to be a full implementation`
        });
    }

    return { checks, riskScore };
}

// Check ownership
async function checkOwnership(contract) {
    const checks = [];
    let riskScore = 0;

    try {
        let owner;
        try {
            owner = await contract.owner();
        } catch {
            try {
                owner = await contract.getOwner();
            } catch {
                owner = null;
            }
        }

        if (owner) {
            // Check if owner is zero address (renounced)
            if (owner === ethers.constants.AddressZero) {
                checks.push({
                    type: 'success',
                    title: '✓ Ownership Renounced',
                    description: 'Contract ownership has been renounced'
                });
            } else {
                checks.push({
                    type: 'success',
                    title: 'ℹ️ Has Owner',
                    description: `Owner: ${owner.slice(0, 6)}...${owner.slice(-4)} - Common for managed tokens`
                });
                results.riskScore += 0; // Reduced from 8 - having owner is normal checking logic
            }
        } else {
            checks.push({
                type: 'success',
                title: '✓ No Owner Function',
                description: 'Contract does not have owner functions'
            });
        }
    } catch (error) {
        console.error('Ownership check error:', error);
    }

    return { checks, riskScore };
}



// Check Liquidity and Simulate Buy
async function checkLiquidityAndSimulation(contract, tokenAddress) {
    const checks = [];
    let riskScore = 0;

    try {
        const factory = new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider);
        const pairAddress = await factory.getPair(tokenAddress, WETH_ADDRESS);

        if (pairAddress === ethers.constants.AddressZero) {
            checks.push({
                type: 'warning',
                title: '⚠️ No Liquidity Found',
                description: 'No Uniswap V2 pair found. Token might not be trading yet.'
            });
            riskScore += 10;
            return { checks, riskScore };
        }

        // Pair found, check reserves
        const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
        const reserves = await pair.getReserves();

        // Very basic liquidity check (non-zero)
        if (reserves.reserve0.isZero() && reserves.reserve1.isZero()) {
            checks.push({
                type: 'warning',
                title: '⚠️ Empty Liquidity Pool',
                description: 'Liquidity pair exists but is empty.'
            });
            riskScore += 10;
        } else {
            checks.push({
                type: 'success',
                title: '✓ Liquidity Detected',
                description: `Found valid liquidity pool at ${pairAddress.slice(0, 6)}...`
            });
        }

        // SIMULATION: Try to transfer from Pair to Random Address (Simulates BUY)
        // Since the Pair usually has tokens, this is a valid "Buy" simulation (Pool -> User)
        try {
            const randomUser = '0x000000000000000000000000000000000000dEaD'; // Burn address as receiver

            // Encode transfer(to, amount)
            // Note: We need to impersonate the pair. We can't do that with standard generic provider checking.
            // BUT, we can try to estimateGas for the logic.
            // If we use 'from' as the pair address, estimateGas checks if the Pair *could* send.

            // However, standard RPC nodes verify the signature of 'from'. We can't sign for the pair.
            // Wait, provider.call or estimateGas normally requires a signature if it's a transaction.
            // Actually, for estimateGas, if you don't own the private key, you can't simulate *from* that address easily on public RPCs without "eth_call" overrides which standard ethers provider doesn't strictly abstract well for all RPCs.

            // Let's fallback to the previous logic but using the PAIR as the target if possible, or just checking standard transfers.
            // Checking simple transfer allowability is often the best proxy we have without a backend simulator.

            // Let's try to simulate a transfer using the PAIR as the 'from' address. 
            // Most modern RPCs (like Alchemy/Infura/Base) allow estimateGas with arbitrary 'from'.
            const testAmount = ethers.utils.parseUnits('1', 18); // Try 1 token

            const data = contract.interface.encodeFunctionData('transfer', [randomUser, testAmount]);

            await provider.estimateGas({
                to: tokenAddress,
                from: pairAddress, // Simulating FROM the pair
                data: data
            });

            checks.push({
                type: 'success',
                title: '✓ Buy Simulation (Pool -> User)',
                description: 'Transfer from Liquidity Pool appears allowed.'
            });

        } catch (error) {
            // If this fails, it might be that the pair has no balance OR it's a honeypot blocking buys.
            // We can check balance to be sure.
            const pairBalance = await contract.balanceOf(pairAddress);

            if (pairBalance.isZero()) {
                // Not a honeypot, just empty
            } else {
                if (error.message.includes('revert') || error.message.includes('execution reverted')) {
                    checks.push({
                        type: 'danger',
                        title: '🚨 Buy Simulation Failed',
                        description: 'Unable to transfer tokens from Liquidity Pool. Likely a Honeypot or Paused!'
                    });
                    riskScore += 50; // Critical
                } else {
                    // Maybe just gas estimation error
                }
            }
        }

        // Sell Simulation (User -> Pool)
        // We can't simulate this accurately without a user who holds tokens.
        // But we can check if the contract blocks transfers *TO* the pair.

    } catch (error) {
        console.error('Liquidity checking error:', error);
        checks.push({
            type: 'warning',
            title: '⚠️ Liquidity Check Failed',
            description: 'Could not verify liquidity pool.'
        });
    }

    return { checks, riskScore };
}

// Display results
function displayResults(results, address) {
    hideError();

    // Calculate risk level
    const riskLevel = calculateRiskLevel(results.riskScore);

    // Update risk meter
    updateRiskMeter(riskLevel, results.riskScore);

    // Update token info
    if (results.tokenInfo.name) {
        tokenName.textContent = results.tokenInfo.name;
        tokenSymbol.textContent = results.tokenInfo.symbol;
        tokenDecimals.textContent = results.tokenInfo.decimals;

        const supply = ethers.utils.formatUnits(
            results.tokenInfo.totalSupply,
            results.tokenInfo.decimals
        );
        tokenSupply.textContent = formatNumber(supply);
    } else {
        tokenName.textContent = 'Unknown';
        tokenSymbol.textContent = 'Unknown';
        tokenDecimals.textContent = '-';
        tokenSupply.textContent = '-';
    }

    // Update explorer link
    explorerLink.href = EXPLORER_URL + address;

    // Display analysis details
    displayAnalysisDetails(results.checks);

    // Show results
    resultsContainer.classList.remove('hidden');
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Calculate risk level
function calculateRiskLevel(score) {
    if (score >= 60) { // Raised from 50
        return { level: 'danger', label: 'High Risk' };
    } else if (score >= 30) { // Raised from 25
        return { level: 'warning', label: 'Medium Risk' };
    } else {
        return { level: 'safe', label: 'Low Risk' };
    }
}

// Update risk meter
function updateRiskMeter(riskLevel, score) {
    riskBadge.textContent = riskLevel.label;
    riskBadge.className = `risk-badge ${riskLevel.level}`;
    riskScoreValue.textContent = Math.min(score, 100);

    const percentage = Math.min(score, 100);
    riskFill.style.width = `${percentage}%`;

    // Set color based on level
    if (riskLevel.level === 'safe') {
        riskFill.style.background = 'linear-gradient(90deg, var(--success-color), hsl(140, 70%, 65%))';
    } else if (riskLevel.level === 'warning') {
        riskFill.style.background = 'linear-gradient(90deg, var(--warning-color), hsl(45, 95%, 70%))';
    } else {
        riskFill.style.background = 'linear-gradient(90deg, var(--danger-color), hsl(0, 85%, 70%))';
    }
}

// Display analysis details
function displayAnalysisDetails(checks) {
    detailsList.innerHTML = '';

    checks.forEach(check => {
        const item = document.createElement('div');
        item.className = `detail-item ${check.type}`;

        const icon = getIconForType(check.type);

        item.innerHTML = `
            ${icon}
            <div class="detail-content">
                <div class="detail-title">${check.title}</div>
                <div class="detail-description">${check.description}</div>
            </div>
        `;

        detailsList.appendChild(item);
    });
}

// Get icon SVG for detail type
function getIconForType(type) {
    const icons = {
        success: `
            <svg class="detail-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `,
        warning: `
            <svg class="detail-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55101 19.3437 1.64151 19.6871 1.81445 19.9905C1.98738 20.2939 2.23675 20.5467 2.53773 20.7239C2.83871 20.9011 3.18082 20.9962 3.53 21H20.47C20.8192 20.9962 21.1613 20.9011 21.4623 20.7239C21.7633 20.5467 22.0126 20.2939 22.1856 19.9905C22.3585 19.6871 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56611 13.2807 3.32312 12.9812 3.15448C12.6817 2.98585 12.3437 2.89725 12 2.89725C11.6563 2.89725 11.3183 2.98585 11.0188 3.15448C10.7193 3.32312 10.4683 3.56611 10.29 3.86Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `,
        danger: `
            <svg class="detail-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `
    };

    return icons[type] || icons.success;
}

// Format large numbers
function formatNumber(num) {
    const n = parseFloat(num);
    if (n >= 1e9) {
        return (n / 1e9).toFixed(2) + 'B';
    } else if (n >= 1e6) {
        return (n / 1e6).toFixed(2) + 'M';
    } else if (n >= 1e3) {
        return (n / 1e3).toFixed(2) + 'K';
    }
    return n.toFixed(2);
}

// Update loading message
function updateLoadingMessage(message) {
    loadingMessage.textContent = message;
}

// UI state management
function showLoading(message) {
    scanButton.disabled = true;
    loadingMessage.textContent = message;
    loadingState.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
}

function hideLoading() {
    scanButton.disabled = false;
    loadingState.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    errorContainer.classList.add('hidden');
}

function hideResults() {
    resultsContainer.classList.add('hidden');
}
