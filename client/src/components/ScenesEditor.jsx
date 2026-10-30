import React, { useEffect, useState } from 'react';
import { Layers, Plus, Trash2, Save, X, GripVertical } from 'lucide-react';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '../api.js';
import MediaField from './MediaPicker.jsx';

const uid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

const makeMessage = (text = 'Новое сообщение') => ({
    _key: uid(),
    type: 'text',
    text,
    buttons: [],
});

// Добавляет клиентские ключи (для dnd-kit) к сцене, полученной с сервера
const withKeys = (scene) => ({
    ...scene,
    steps: (scene.steps || []).map((step, stepIndex) => ({
        ...step,
        _key: step._key || uid(),
        stepIndex,
        messages: (step.messages || []).map((msg) => ({
            ...msg,
            _key: msg._key || uid(),
            buttons: msg.buttons || [],
        })),
    })),
});

// Убирает клиентские ключи и перенумеровывает шаги перед отправкой на сервер.
// Инлайн-кнопки оставляем только у последнего сообщения в шаге.
const serializeScene = (scene) => ({
    title: scene.title,
    description: scene.description,
    isActive: scene.isActive,
    steps: (scene.steps || []).map((step, stepIndex) => {
        const { _key, messages, ...rest } = step;
        return {
            ...rest,
            stepIndex,
            messages: (messages || []).map(({ _key: msgKey, ...msg }, msgIndex, allMessages) => ({
                ...msg,
                buttons: msgIndex === allMessages.length - 1 ? msg.buttons || [] : [],
            })),
        };
    }),
});

function SortableSceneRow({ scene, isSelected, canDelete, onSelect, onDelete }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: scene.sceneId, data: { type: 'scene' } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onSelect}
            className={`w-full text-left px-2 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-between cursor-pointer ${
                isSelected
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
        >
            <button
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                className="p-1 mr-1 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none"
                title="Перетащить сцену"
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <div className="truncate flex-1 pr-2">
                <div className="truncate">{scene.title}</div>
                <div className="text-[10px] text-gray-400 font-mono">{scene.sceneId}</div>
            </div>
            <div className="flex items-center gap-1">
                <Layers className="w-4 h-4 opacity-50" />
                {canDelete && (
                    <button
                        onClick={(e) => onDelete(e)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded transition"
                        title="Удалить сцену"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

function SortableStepCard({ step, stepIndex, onAddMessage, onRemoveStep, children }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step._key, data: { type: 'step' } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <button
                        ref={setActivatorNodeRef}
                        {...attributes}
                        {...listeners}
                        className="p-1 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none"
                        title="Перетащить шаг"
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                    <h4 className="font-semibold text-gray-700">Шаг №{stepIndex + 1}</h4>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onAddMessage}
                        className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2.5 py-1 rounded-md font-medium transition"
                    >
                        + Сообщение
                    </button>
                    <button
                        onClick={onRemoveStep}
                        className="text-red-500 hover:text-red-700 p-1 rounded transition"
                        title="Удалить шаг"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
            {children}
        </div>
    );
}

function SortableMessageCard({ msg, msgKey, stepKey, isLastMessage, onChange, onPatch, onRemove, messageHandlers }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: msgKey, data: { type: 'message', stepKey } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="bg-white p-4 rounded-lg border border-gray-200 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button
                        ref={setActivatorNodeRef}
                        {...attributes}
                        {...listeners}
                        className="p-1 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none"
                        title="Перетащить сообщение"
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold uppercase px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {msg.type}
                    </span>
                    <select
                        value={msg.type}
                        onChange={(e) => onChange('type', e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                        <option value="text">Текст</option>
                        <option value="photo">Фото</option>
                        <option value="video">Видео</option>
                        <option value="videoNote">Кружок (videoNote)</option>
                    </select>
                </div>
                <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition" title="Удалить сообщение">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {msg.type === 'photo' || msg.type === 'video' || msg.type === 'videoNote' ? (
                <div className="space-y-2">
                    <MediaField msg={msg} onPatch={onPatch} />
                    {msg.type !== 'videoNote' && (
                        <textarea
                            placeholder="Подпись к медиа (caption)..."
                            value={msg.caption || msg.text || ''}
                            onChange={(e) => onChange('caption', e.target.value)}
                            className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                            rows={2}
                        />
                    )}
                </div>
            ) : (
                <textarea
                    placeholder="Текст сообщения..."
                    value={msg.text || ''}
                    onChange={(e) => onChange('text', e.target.value)}
                    className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3}
                />
            )}

            {/* Inline Buttons Editor: только для последнего сообщения в шаге */}
            {isLastMessage ? (
                <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-600">Инлайн-кнопки</span>
                        <button
                            onClick={messageHandlers.addButton}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium transition flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Добавить кнопку
                        </button>
                    </div>
                    {(!msg.buttons || msg.buttons.length === 0) ? (
                        <p className="text-xs text-gray-400 italic">Нет инлайн-кнопок</p>
                    ) : (
                        <div className="space-y-2">
                            {msg.buttons.map((row, rowIndex) => (
                                <div key={rowIndex} className="flex flex-wrap items-center gap-2">
                                    {row.map((btn, btnIndex) => (
                                        <div key={btnIndex} className="flex items-center gap-1 bg-gray-50 p-2 rounded-lg border border-gray-200 flex-1 min-w-[240px]">
                                            <input
                                                type="text"
                                                placeholder="Текст кнопки"
                                                value={btn.text}
                                                onChange={(e) => messageHandlers.updateButton(rowIndex, btnIndex, 'text', e.target.value)}
                                                className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 flex-1"
                                            />
                                            <select
                                                value={btn.action}
                                                onChange={(e) => messageHandlers.updateButton(rowIndex, btnIndex, 'action', e.target.value)}
                                                className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 w-44 font-mono"
                                            >
                                                <option value="next">next</option>
                                                <option value="lead:question">lead:question</option>
                                                <option value="lead:consultation">lead:consultation</option>
                                            </select>
                                            <button
                                                onClick={() => messageHandlers.removeButton(rowIndex, btnIndex)}
                                                className="text-gray-400 hover:text-red-500 p-1"
                                                title="Удалить кнопку"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <p className="border-t pt-3 mt-3 text-xs text-gray-400 italic">
                    Инлайн-кнопки доступны только у последнего сообщения в шаге
                </p>
            )}
        </div>
    );
}

export default function ScenesEditor() {
    const [scenes, setScenes] = useState([]);
    const [selectedScene, setSelectedScene] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        fetchScenes();
    }, []);

    const fetchScenes = () => {
        apiFetch('/api/scenes')
            .then(({ data }) => {
                setScenes(data);
                setLoadError(null);
                if (data.length > 0 && (!selectedScene || !data.some((s) => s.sceneId === selectedScene.sceneId))) {
                    setSelectedScene(withKeys(data[0]));
                } else if (data.length === 0) {
                    setSelectedScene(null);
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoadError(`Не удалось загрузить сцены: ${err.message}`);
                setLoading(false);
            });
    };

    const handleSaveScene = async () => {
        if (!selectedScene) return;
        setSaving(true);
        try {
            const { ok, data } = await apiFetch(`/api/scenes/${selectedScene.sceneId}`, {
                method: 'PUT',
                body: serializeScene(selectedScene),
            });
            if (ok && data.success) {
                alert('Сцена успешно сохранена!');
                setSelectedScene(withKeys(data.scene));
                fetchScenes();
            } else {
                alert(data?.error || 'Ошибка сохранения');
            }
        } catch (err) {
            alert(`Ошибка сервера: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateScene = async () => {
        const sceneId = prompt('Введите уникальный ID сцены (например: custom_scene):');
        if (!sceneId) return;
        const title = prompt('Введите название сцены:', 'Новая сцена');
        if (!title) return;

        try {
            const { ok, data } = await apiFetch('/api/scenes', {
                method: 'POST',
                body: {
                    sceneId: sceneId.trim(),
                    title: title.trim(),
                    description: '',
                    steps: [
                        {
                            stepIndex: 0,
                            messages: [
                                { type: 'text', text: 'Новое сообщение', buttons: [] }
                            ]
                        }
                    ],
                },
            });
            if (ok && data.success) {
                fetchScenes();
                setSelectedScene(withKeys(data.scene));
            } else {
                alert(data?.error || 'Ошибка создания сцены');
            }
        } catch (err) {
            alert(`Ошибка сервера: ${err.message}`);
        }
    };

    const handleDeleteScene = async (sceneId, e) => {
        e.stopPropagation();
        if (!confirm(`Вы действительно хотите удалить сцену "${sceneId}"?`)) return;

        try {
            const { ok, data } = await apiFetch(`/api/scenes/${sceneId}`, {
                method: 'DELETE',
            });
            if (ok && data.success) {
                fetchScenes();
            } else {
                alert(data?.error || 'Ошибка удаления');
            }
        } catch (err) {
            alert(`Ошибка сервера: ${err.message}`);
        }
    };

    const saveSceneOrder = async (orderedScenes) => {
        try {
            const { ok, data } = await apiFetch('/api/scenes/reorder', {
                method: 'POST',
                body: { order: orderedScenes.map((s) => s.sceneId) },
            });
            if (!ok || !data.success) throw new Error(data?.error || 'ошибка сохранения порядка');
            setScenes(data.scenes);
        } catch (err) {
            alert(`Не удалось сохранить порядок сцен: ${err.message}`);
            fetchScenes();
        }
    };

    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;

        const type = active.data.current?.type;

        if (type === 'scene') {
            const oldIndex = scenes.findIndex((s) => s.sceneId === active.id);
            const newIndex = scenes.findIndex((s) => s.sceneId === over.id);
            if (oldIndex < 0 || newIndex < 0) return;

            const reordered = arrayMove(scenes, oldIndex, newIndex);
            setScenes(reordered);
            saveSceneOrder(reordered);
            return;
        }

        if (!selectedScene) return;

        if (type === 'step') {
            const oldIndex = selectedScene.steps.findIndex((s) => s._key === active.id);
            const newIndex = selectedScene.steps.findIndex((s) => s._key === over.id);
            if (oldIndex < 0 || newIndex < 0) return;

            setSelectedScene((prev) => ({
                ...prev,
                steps: arrayMove(prev.steps, oldIndex, newIndex).map((step, index) => ({ ...step, stepIndex: index })),
            }));
            return;
        }

        if (type === 'message') {
            const stepKey = active.data.current?.stepKey;
            const step = selectedScene.steps.find((s) => s._key === stepKey);
            if (!step) return;

            const oldIndex = step.messages.findIndex((m) => m._key === active.id);
            const newIndex = step.messages.findIndex((m) => m._key === over.id);
            if (oldIndex < 0 || newIndex < 0) return;

            setSelectedScene((prev) => ({
                ...prev,
                steps: prev.steps.map((s) =>
                    s._key !== stepKey ? s : { ...s, messages: arrayMove(s.messages, oldIndex, newIndex) }
                ),
            }));
        }
    };

    const addStep = () => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: [
                ...prev.steps,
                { _key: uid(), stepIndex: prev.steps.length, messages: [makeMessage()] },
            ],
        }));
    };

    const removeStep = (stepKey) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps
                .filter((s) => s._key !== stepKey)
                .map((step, index) => ({ ...step, stepIndex: index })),
        }));
    };

    const addMessageToStep = (stepKey) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
                s._key !== stepKey ? s : { ...s, messages: [...s.messages, makeMessage('Новое сообщение в шаге')] }
            ),
        }));
    };

    const removeMessageFromStep = (stepKey, msgKey) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
                s._key !== stepKey ? s : { ...s, messages: s.messages.filter((m) => m._key !== msgKey) }
            ),
        }));
    };

    const updateMessage = (stepKey, msgKey, field, value) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
                s._key !== stepKey
                    ? s
                    : {
                        ...s,
                        messages: s.messages.map((m) => (m._key !== msgKey ? m : { ...m, [field]: value })),
                    }
            ),
        }));
    };

    // Обновление сразу нескольких полей сообщения (например assetKey + file при выборе из медиатеки)
    const updateMessagePatch = (stepKey, msgKey, patch) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
                s._key !== stepKey
                    ? s
                    : {
                        ...s,
                        messages: s.messages.map((m) => (m._key !== msgKey ? m : { ...m, ...patch })),
                    }
            ),
        }));
    };

    const updateMessageButtons = (stepKey, msgKey, updater) => {
        setSelectedScene((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
                s._key !== stepKey
                    ? s
                    : {
                        ...s,
                        messages: s.messages.map((m) =>
                            m._key !== msgKey ? m : { ...m, buttons: updater(m.buttons || []) }
                        ),
                    }
            ),
        }));
    };

    const addButtonToMessage = (stepKey, msgKey) => {
        updateMessageButtons(stepKey, msgKey, (buttons) => [...buttons, [{ text: 'Далее', action: 'next' }]]);
    };

    const updateButton = (stepKey, msgKey, rowIndex, btnIndex, field, value) => {
        updateMessageButtons(stepKey, msgKey, (buttons) =>
            buttons.map((row, rIdx) =>
                rIdx !== rowIndex ? row : row.map((btn, bIdx) => (bIdx !== btnIndex ? btn : { ...btn, [field]: value }))
            )
        );
    };

    const removeButton = (stepKey, msgKey, rowIndex, btnIndex) => {
        updateMessageButtons(stepKey, msgKey, (buttons) => {
            const nextButtons = buttons.map((row, rIdx) =>
                rIdx !== rowIndex ? row : row.filter((_, bIdx) => bIdx !== btnIndex)
            );
            return nextButtons.filter((row) => row.length > 0);
        });
    };

    if (loading) return <div className="p-6 text-gray-500">Загрузка редактора сцен...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Редактор сцен и сообщений</h1>
                <button
                    onClick={handleSaveScene}
                    disabled={saving || !selectedScene}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Сохранение...' : 'Сохранить изменения в БД'}
                </button>
            </div>

            <p className="text-xs text-gray-400 -mt-3">
                Порядок сцен сохраняется сразу после перетаскивания. Порядок шагов и сообщений — по кнопке «Сохранить изменения в БД».
            </p>

            {loadError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {loadError}
                </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Scenes List */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3">
                        <div className="flex justify-between items-center px-2">
                            <h3 className="font-semibold text-gray-700">Сцены бота</h3>
                            <button
                                onClick={handleCreateScene}
                                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg font-medium transition"
                                title="Добавить новую сцену"
                            >
                                <Plus className="w-3.5 h-3.5" /> Сцена
                            </button>
                        </div>
                        <SortableContext items={scenes.map((s) => s.sceneId)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-1">
                                {scenes.map((scene) => (
                                    <SortableSceneRow
                                        key={scene.sceneId}
                                        scene={scene}
                                        isSelected={selectedScene?.sceneId === scene.sceneId}
                                        canDelete={scenes.length > 1}
                                        onSelect={() => setSelectedScene(withKeys(scene))}
                                        onDelete={(e) => handleDeleteScene(scene.sceneId, e)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </div>

                    {/* Selected Scene Steps Editor */}
                    {selectedScene && (
                        <div className="md:col-span-3 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                            <div className="border-b pb-4 flex justify-between items-center">
                                <div className="space-y-1 flex-1 pr-4">
                                    <label className="text-xs font-semibold text-gray-500 uppercase">Название сцены</label>
                                    <input
                                        type="text"
                                        value={selectedScene.title}
                                        onChange={(e) => setSelectedScene((prev) => ({ ...prev, title: e.target.value }))}
                                        className="w-full text-xl font-bold text-gray-950 border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                                    />
                                    <label className="text-xs font-semibold text-gray-500 uppercase pt-2 block">Описание сцены (для главного меню)</label>
                                    <textarea
                                        value={selectedScene.description || ''}
                                        onChange={(e) => setSelectedScene((prev) => ({ ...prev, description: e.target.value }))}
                                        placeholder="Описание сцены для главного меню..."
                                        className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                                        rows={2}
                                    />
                                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                                        <span>ID сцены: <strong className="font-mono">{selectedScene.sceneId}</strong></span>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedScene.isActive ?? true}
                                                onChange={(e) => setSelectedScene((prev) => ({ ...prev, isActive: e.target.checked }))}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            Активна
                                        </label>
                                    </div>
                                </div>
                                <button
                                    onClick={addStep}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shrink-0"
                                >
                                    <Plus className="w-4 h-4" /> Добавить шаг
                                </button>
                            </div>

                            {/* Steps List */}
                            <SortableContext
                                items={selectedScene.steps.map((s) => s._key)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-6">
                                    {selectedScene.steps.map((step, stepIndex) => (
                                        <SortableStepCard
                                            key={step._key}
                                            step={step}
                                            stepIndex={stepIndex}
                                            onAddMessage={() => addMessageToStep(step._key)}
                                            onRemoveStep={() => removeStep(step._key)}
                                        >
                                            <SortableContext
                                                items={step.messages.map((m) => m._key)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                <div className="space-y-3">
                                                    {step.messages.map((msg, msgIndex) => (
                                                        <SortableMessageCard
                                                            key={msg._key}
                                                            msg={msg}
                                                            msgKey={msg._key}
                                                            stepKey={step._key}
                                                            isLastMessage={msgIndex === step.messages.length - 1}
                                                            onChange={(field, value) => updateMessage(step._key, msg._key, field, value)}
                                                            onPatch={(patch) => updateMessagePatch(step._key, msg._key, patch)}
                                                            onRemove={() => removeMessageFromStep(step._key, msg._key)}
                                                            messageHandlers={{
                                                                addButton: () => addButtonToMessage(step._key, msg._key),
                                                                updateButton: (rowIndex, btnIndex, field, value) =>
                                                                    updateButton(step._key, msg._key, rowIndex, btnIndex, field, value),
                                                                removeButton: (rowIndex, btnIndex) =>
                                                                    removeButton(step._key, msg._key, rowIndex, btnIndex),
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </SortableContext>
                                        </SortableStepCard>
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    )}
                </div>
            </DndContext>
        </div>
    );
}

