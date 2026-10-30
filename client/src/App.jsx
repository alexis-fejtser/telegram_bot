import React, { useState } from 'react';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import ScenesEditor from './components/ScenesEditor.jsx';
import UsersList from './components/UsersList.jsx';
import Messenger from './components/Messenger.jsx';
import Settings from './components/Settings.jsx';
import { LayoutDashboard, Layers, Users, MessageSquare, Settings as SettingsIcon, LogOut } from 'lucide-react';

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('admin_token')));
    const [activeTab, setActiveTab] = useState('dashboard');

    if (!isAuthenticated) {
        return <Login onLogin={() => setIsAuthenticated(true)} />;
    }

    const handleLogout = () => {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
    };

    return (
        <div className="min-h-screen flex bg-gray-100">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 text-white flex flex-col justify-between">
                <div>
                    <div className="p-6 border-b border-gray-800">
                        <h1 className="font-bold text-lg text-white">Bot Admin Panel</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Управление Telegram-ботом</p>
                    </div>

                    <nav className="p-4 space-y-1">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                                activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <LayoutDashboard className="w-5 h-5" />
                            Аналитика
                        </button>

                        <button
                            onClick={() => setActiveTab('scenes')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                                activeTab === 'scenes' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <Layers className="w-5 h-5" />
                            Редактор сцен
                        </button>

                        <button
                            onClick={() => setActiveTab('users')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                                activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <Users className="w-5 h-5" />
                            Пользователи
                        </button>

                        <button
                            onClick={() => setActiveTab('messenger')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                                activeTab === 'messenger' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <MessageSquare className="w-5 h-5" />
                            Мессенджер & Вопросы
                        </button>

                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                                activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <SettingsIcon className="w-5 h-5" />
                            Настройки
                        </button>
                    </nav>
                </div>

                <div className="p-4 border-t border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl text-sm font-medium transition"
                    >
                        <LogOut className="w-5 h-5" />
                        Выйти
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'scenes' && <ScenesEditor />}
                {activeTab === 'users' && <UsersList />}
                {activeTab === 'messenger' && <Messenger />}
                {activeTab === 'settings' && <Settings />}
            </main>
        </div>
    );
}
