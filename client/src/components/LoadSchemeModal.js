import React from 'react';
import '../styles/LoadSchemeModal.css'; // Создадим файл стилей для модалки

const LoadSchemeModal = ({ isOpen, onClose, schemes, onLoad, isLoading }) => {
    if (!isOpen) {
        return null; // Не рендерим ничего, если модалка не открыта
    }

    const handleOverlayClick = (e) => {
        // Закрываем по клику на фон (overlay), но не на само окно
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleSchemeClick = (schemeId) => {
        if (window.confirm("Loading a scheme will replace the current diagram. Are you sure?")) {
             onLoad(schemeId); // Вызываем загрузку, переданную из App.js
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-content">
                <h2>Load Scheme</h2>
                {isLoading && schemes.length === 0 && <p>Loading scheme list...</p>}
                {!isLoading && schemes.length === 0 && <p>No saved schemes found.</p>}

                {schemes.length > 0 && (
                    <ul className="scheme-list">
                        {schemes.map(scheme => (
                            <li key={scheme._id} onClick={() => !isLoading && handleSchemeClick(scheme._id)} className={isLoading ? 'disabled' : ''}>
                                {scheme.name}
                                {/* Можно добавить дату сохранения, если она есть в данных */}
                                {/* <span>{new Date(scheme.updatedAt).toLocaleString()}</span> */}
                            </li>
                        ))}
                    </ul>
                )}

                <button onClick={onClose} disabled={isLoading}>Cancel</button>
            </div>
        </div>
    );
};

export default LoadSchemeModal;