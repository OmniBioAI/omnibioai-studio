import { useState, useEffect } from 'react';

export default function LicenseGate({ children }) {
    const [license, setLicense] = useState(null);
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [validating, setValidating] = useState(false);

    useEffect(() => {
        checkCachedLicense();
    }, []);

    async function checkCachedLicense() {
        // In browser/dev mode there is no Electron preload — skip license gate
        if (!window.electronAPI) {
            setLicense({ valid: true, tier: 'dev', expiry: '2099-12-31', days_remaining: 99999 });
            setLoading(false);
            return;
        }
        try {
            const cached = await window.electronAPI.getLicense();
            if (cached?.valid) {
                const expiry = new Date(cached.expiry);
                if (new Date() < expiry) {
                    setLicense(cached);
                    setLoading(false);
                    return;
                }
            }
        } catch (e) {}
        setLoading(false);
    }

    async function handleValidate() {
        if (!window.electronAPI) {
            setError('License validation requires the desktop app');
            return;
        }
        if (!key.trim()) {
            setError('Please enter a license key');
            return;
        }
        setValidating(true);
        setError('');
        try {
            const result = await window.electronAPI.validateLicense(key.trim());
            if (result.valid) {
                setLicense(result);
            } else {
                setError(result.reason || 'Invalid license key');
            }
        } catch (e) {
            setError('Validation failed: ' + e.message);
        }
        setValidating(false);
    }

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
            <div className="text-white text-xl">Loading...</div>
        </div>
    );

    if (!license) return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-white mb-2">
                        OmniBioAI Studio
                    </h1>
                    <p className="text-gray-400">Enter your license key to continue</p>
                </div>

                <input
                    type="text"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="OMNI-XXXX-XXXX-XXXX-XXXX"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 mb-3 font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={e => e.key === 'Enter' && handleValidate()}
                />

                {error && (
                    <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
                )}

                <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                    {validating ? 'Validating...' : 'Activate License'}
                </button>

                <p className="text-gray-500 text-xs text-center mt-4">
                    Need a license?{' '}
                    <a href="mailto:mandecent.gupta@gmail.com" className="text-blue-400 hover:underline">
                        Contact us for beta access
                    </a>
                </p>
            </div>
        </div>
    );

    return (
        <>
            <div className="fixed bottom-2 right-2 bg-gray-800 text-xs text-gray-400 px-2 py-1 rounded opacity-50">
                {license.tier} · expires {license.expiry} · {license.days_remaining}d left
            </div>
            {children}
        </>
    );
}
