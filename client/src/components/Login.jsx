import React, { useState } from 'react';
import { Lock } from 'lucide-react';

export default function Login({ onLogin }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                localStorage.setItem('admin_token', data.token);
                onLogin();
            } else {
                setError(data.error || 'Неверный пароль');
            }
        } catch (err) {
            setError('Ошибка соединения с сервером');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700">
                <div className="flex justify-center mb-6">
                    <div className="p-3 bg-blue-600/20 text-blue-400 rounded-full">
                        <Lock className="w-8 h-8" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-white text-center mb-2">Админ-панель бота</h2>
                <p className="text-gray-400 text-center mb-6 text-sm">Введите мастер-пароль для доступа</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Пароль</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200 disabled:opacity-50"
                    >
                        {loading ? 'Вход...' : 'Войти в панель'}
                    </button>
                </form>
            </div>
        </div>
    );
}
