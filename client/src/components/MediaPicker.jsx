import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Film, FolderOpen, Upload, X, Loader2, Trash2, Play, Flame } from 'lucide-react';
import { apiFetch, resolveUrl } from '../api.js';

const TYPE_LABELS = {
    photo: 'Фото',
    video: 'Видео',
    videoNote: 'Кружок',
};

const TYPE_FILTERS = [
    { value: 'all', label: 'Все' },
    { value: 'photo', label: 'Фото' },
    { value: 'video', label: 'Видео' },
    { value: 'videoNote', label: 'Кружки' },
];

// Для загрузки: по умолчанию тип берём из типа текущего сообщения
function uploadMediaTypeFor(messageType) {
    if (messageType === 'videoNote') return 'videoNote';
    if (messageType === 'video') return 'video';
    return 'photo';
}

function assetFileUrl(assetKey, rev) {
    const base = resolveUrl(`/api/assets/${encodeURIComponent(assetKey)}/file`);
    return rev ? `${base}?v=${rev}` : base;
}

// URL для превью прикреплённого файла: сначала по assetKey, затем по пути внутри uploads/
function messageMediaUrl(msg, rev) {
    if (msg.assetKey) {
        return assetFileUrl(msg.assetKey, rev);
    }

    if (msg.file) {
        const normalized = String(msg.file).replace(/\\/g, '/').replace(/^\.\//, '');
        const uploadsIndex = normalized.toLowerCase().indexOf('/uploads/');
        if (uploadsIndex !== -1) {
            return resolveUrl(`/uploads/${normalized.slice(uploadsIndex + '/uploads/'.length)}`);
        }
        if (normalized.startsWith('uploads/')) {
            return resolveUrl(`/${normalized}`);
        }
    }

    return null;
}

function looksLikeFilePath(value) {
    return /[\\/]/.test(value) || value.startsWith('.');
}

function MediaThumb({ url, type, className = '' }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [url]);

    const isRound = type === 'videoNote';
    const shape = isRound ? 'rounded-full' : 'rounded-md';

    if (!url || failed) {
        return (
            <div className={`bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 ${shape} ${className}`}>
                {type === 'photo' ? (
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                ) : (
                    <Film className="w-5 h-5 text-gray-400" />
                )}
            </div>
        );
    }

    if (type === 'photo') {
        return (
            <img
                src={url}
                alt=""
                onError={() => setFailed(true)}
                className={`object-cover bg-gray-100 border border-gray-200 shrink-0 ${shape} ${className}`}
            />
        );
    }

    return (
        <div className={`relative bg-black overflow-hidden shrink-0 ${shape} ${className}`}>
            <video
                src={`${url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                    try {
                        e.currentTarget.currentTime = 0.1;
                    } catch (err) {
                        /* игнорируем: браузер сам покажет первый кадр */
                    }
                }}
                onError={() => setFailed(true)}
                className="w-full h-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="w-4 h-4 text-white" />
            </span>
        </div>
    );
}

function MediaLibraryModal({ open, onClose, mediaTypeHint, onSelect }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [uploading, setUploading] = useState(false);
    const [warmingUp, setWarmingUp] = useState(false);
    const [warmupStatus, setWarmupStatus] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleWarmup = async () => {
        setWarmingUp(true);
        setWarmupStatus(null);
        try {
            const { ok, data } = await apiFetch('/api/assets/warmup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: false }),
            });
            if (!ok) throw new Error(data?.error || 'Ошибка прогрева');
            setWarmupStatus(`Прогрето: ${data.warmed}, в кэше: ${data.skipped}`);
            setTimeout(() => setWarmupStatus(null), 4000);
        } catch (err) {
            setError(`Ошибка прогрева: ${err.message}`);
        } finally {
            setWarmingUp(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        apiFetch('/api/assets')
            .then(({ ok, data }) => {
                if (cancelled) return;
                if (ok) {
                    setAssets(Array.isArray(data) ? data : []);
                } else {
                    setError(data?.error || 'Не удалось загрузить медиатеку');
                }
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    const handleUploadFiles = async (files) => {
        const file = files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', uploadMediaTypeFor(mediaTypeHint));

        setUploading(true);
        setError(null);

        try {
            const { ok, data } = await apiFetch('/api/assets/upload', { method: 'POST', body: formData });
            if (!ok || !data.success) {
                throw new Error(data?.error || 'Не удалось загрузить файл');
            }
            setAssets((prev) => [data.asset, ...prev.filter((a) => a.assetKey !== data.asset.assetKey)]);
            onSelect(data.asset);
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (asset, e) => {
        e.stopPropagation();
        if (!confirm(`Удалить файл "${asset.assetKey}" из медиатеки?`)) return;

        try {
            const { ok, data } = await apiFetch(`/api/assets/${encodeURIComponent(asset.assetKey)}`, { method: 'DELETE' });
            if (!ok) throw new Error(data?.error || 'Не удалось удалить файл');
            setAssets((prev) => prev.filter((a) => a.assetKey !== asset.assetKey));
        } catch (err) {
            setError(err.message);
        }
    };

    if (!open) return null;

    const visibleAssets = filter === 'all' ? assets : assets.filter((a) => a.mediaType === filter);

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white w-full max-w-3xl max-h-[85vh] rounded-xl shadow-xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center px-5 py-4 border-b">
                    <div>
                        <h3 className="font-semibold text-gray-800">Медиатека</h3>
                        <p className="text-xs text-gray-400">Выберите файл из загруженных или добавьте новый с компьютера</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" title="Закрыть">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b bg-gray-50">
                    {TYPE_FILTERS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setFilter(tab.value)}
                            className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                                filter === tab.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}

                    {warmupStatus && (
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-md">
                            {warmupStatus}
                        </span>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleWarmup}
                            disabled={warmingUp}
                            title="Прогреть все медиа в Telegram file-id кэш"
                            className="flex items-center gap-1.5 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
                        >
                            {warmingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5 text-orange-500" />}
                            {warmingUp ? 'Прогрев...' : 'Прогреть кэш'}
                        </button>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {uploading ? 'Загрузка...' : 'Загрузить с компьютера'}
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => handleUploadFiles(e.target.files)}
                    />
                </div>

                <div
                    className={`flex-1 overflow-y-auto p-5 ${dragActive ? 'bg-blue-50' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        handleUploadFiles(e.dataTransfer.files);
                    }}
                >
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 text-gray-500 py-10 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка медиатеки...
                        </div>
                    ) : visibleAssets.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-10">
                            Файлов нет. Загрузите первый файл с компьютера
                            <br />
                            (можно просто перетащить его сюда).
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {visibleAssets.map((asset) => (
                                <div key={asset.assetKey} className="group relative">
                                    <button
                                        onClick={() => onSelect(asset)}
                                        className="w-full text-left space-y-1.5"
                                        title={asset.assetKey}
                                    >
                                        <MediaThumb
                                            url={messageMediaUrl(asset)}
                                            type={asset.mediaType}
                                            className="w-full aspect-square group-hover:ring-2 group-hover:ring-blue-400 transition"
                                        />
                                        <div className="text-[11px] font-mono text-gray-600 truncate">{asset.assetKey}</div>
                                        <div className="text-[10px] text-gray-400">{TYPE_LABELS[asset.mediaType] || asset.mediaType}</div>
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(asset, e)}
                                        className="absolute top-1 right-1 p-1 rounded bg-white/90 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                                        title="Удалить из медиатеки"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Поле прикрепления файла для сообщения типа photo/video/videoNote.
 * Показывает маленькое превью уже прикреплённого файла, даёт выбрать файл
 * из внутренней медиатеки, загрузить с компьютера или ввести ключ вручную.
 */
export default function MediaField({ msg, onPatch }) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [rev, setRev] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const fileInputRef = useRef(null);

    const previewUrl = messageMediaUrl(msg, rev);
    const displayName = msg.assetKey || msg.file || '';

    const applyAsset = (asset) => {
        onPatch({ assetKey: asset.assetKey, file: asset.filePath || '' });
        setRev(Date.now());
        setManualMode(false);
        setLibraryOpen(false);
    };

    const handleUpload = async (files) => {
        const file = files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', uploadMediaTypeFor(msg.type));

        setUploading(true);
        setUploadError(null);

        try {
            const { ok, data } = await apiFetch('/api/assets/upload', { method: 'POST', body: formData });
            if (!ok || !data.success) {
                throw new Error(data?.error || 'Не удалось загрузить файл');
            }
            applyAsset(data.asset);
        } catch (err) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleManualChange = (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
            onPatch({ assetKey: '', file: '' });
            return;
        }
        if (looksLikeFilePath(trimmed)) {
            onPatch({ assetKey: '', file: trimmed });
        } else {
            onPatch({ assetKey: trimmed, file: '' });
        }
    };

    const clearMedia = () => {
        onPatch({ assetKey: '', file: '' });
        setUploadError(null);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-3 border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                <MediaThumb url={previewUrl} type={msg.type} className="w-14 h-14" />

                <div className="flex-1 min-w-0 space-y-1.5">
                    {displayName ? (
                        <div className="text-xs font-mono text-gray-700 truncate" title={displayName}>
                            {displayName}
                        </div>
                    ) : (
                        <div className="text-xs text-gray-400 italic">Файл не прикреплён</div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            onClick={() => setLibraryOpen(true)}
                            className="flex items-center gap-1 text-xs bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded font-medium transition"
                        >
                            <FolderOpen className="w-3.5 h-3.5" /> Медиатека
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-1 text-xs bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded font-medium transition disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {uploading ? 'Загрузка...' : 'С компьютера'}
                        </button>
                        <button
                            onClick={() => setManualMode((v) => !v)}
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-2 py-1 rounded transition"
                        >
                            {manualMode ? 'Скрыть ручной ввод' : 'Ввести ключ вручную'}
                        </button>
                        {displayName && (
                            <button
                                onClick={clearMedia}
                                className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 bg-white px-2 py-1 rounded transition"
                                title="Убрать прикреплённый файл"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {uploadError && <div className="text-xs text-red-600">{uploadError}</div>}

                    {manualMode && (
                        <input
                            type="text"
                            placeholder="Asset Key или путь к файлу (например ./scenes/photo.jpg)"
                            value={msg.assetKey || msg.file || ''}
                            onChange={(e) => handleManualChange(e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                    )}

                    {!msg.assetKey && msg.file && !manualMode && (
                        <div className="text-[11px] text-gray-400">
                            Прикреплён путь к файлу. Для превью загрузите файл в медиатеку или укажите Asset Key.
                        </div>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files)}
                />
            </div>

            <MediaLibraryModal
                open={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                mediaTypeHint={msg.type}
                onSelect={applyAsset}
            />
        </div>
    );
}
