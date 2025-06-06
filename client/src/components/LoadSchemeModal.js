import React from 'react';
import '../styles/LoadSchemeModal.css'; // Убедитесь, что стили подключены

const LoadSchemeModal = ({ isOpen, onClose, schemes, onLoad, onDelete, isLoading }) => { // Добавлен onDelete
    if (!isOpen) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleSchemeClick = (schemeId) => {
        if (window.confirm("Загрузка схемы заменит текущую диаграмму. Вы уверены?")) {
            onLoad(schemeId);
        }
    };

    const handleDeleteClick = (e, schemeId, schemeName) => {
        e.stopPropagation(); // Предотвращаем загрузку схемы при клике на кнопку удаления
        if (window.confirm(`Вы уверены, что хотите удалить схему "${schemeName}"? Это действие нельзя будет отменить.`)) {
            onDelete(schemeId);
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-content">
                <h2>Загрузить / Управление схемами</h2>
                {isLoading && schemes.length === 0 && <p>Загрузка списка схем...</p>}
                {!isLoading && schemes.length === 0 && <p>Сохраненные схемы не найдены.</p>}

                {schemes.length > 0 && (
                    <ul className="scheme-list">
                        {schemes.map(scheme => (
                            <li key={scheme._id} 
                                onClick={() => !isLoading && handleSchemeClick(scheme._id)} 
                                className={isLoading ? 'disabled' : ''}
                                title={`Загрузить схему: ${scheme.name}\nПоследнее обновление: ${new Date(scheme.updatedAt).toLocaleString()}`}
                            >
                                <span>{scheme.name}</span>
                                <div className="scheme-list-actions">
                                    <button 
                                        onClick={(e) => handleDeleteClick(e, scheme._id, scheme.name)} 
                                        disabled={isLoading}
                                        className="delete-action"
                                        title="Удалить схему"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <button onClick={onClose} disabled={isLoading}>Отмена</button>
            </div>
        </div>
    );
};

export default LoadSchemeModal;