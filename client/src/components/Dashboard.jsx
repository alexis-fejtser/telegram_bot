import React, { useEffect, useState } from 'react';
import { Users, UserCheck, HelpCircle, MessageSquare } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard() {
    const [summary, setSummary] = useState({
        totalUsers: 0,
        activeToday: 0,
        totalQuestions: 0,
        pendingQuestions: 0,
    });
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch('/api/analytics/summary').then((res) => res.json()),
            fetch('/api/analytics/activity').then((res) => res.json()),
        ])
            .then(([summaryData, activityData]) => {
                setSummary(summaryData);
                setChartData(activityData);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return <div className="p-6 text-gray-500">Загрузка аналитики...</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Аналитика и Дэшборд</h1>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Всего пользователей</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalUsers}</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                        <Users className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Активных сегодня</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{summary.activeToday}</p>
                    </div>
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                        <UserCheck className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Всего вопросов</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalQuestions}</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                        <HelpCircle className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Ожидают ответа</p>
                        <p className="text-3xl font-bold text-orange-600 mt-1">{summary.pendingQuestions}</p>
                    </div>
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Активность новых пользователей</h3>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" stroke="#888888" />
                            <YAxis stroke="#888888" />
                            <Tooltip />
                            <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="#bfdbfe" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
