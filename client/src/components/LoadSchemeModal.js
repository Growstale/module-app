import React from 'react';
import '../styles/LoadSchemeModal.css';

const LoadSchemeModal = ({ isOpen, onClose, schemes, onLoad, isLoading }) => {
    if (!isOpen) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleSchemeClick = (schemeId) => {
        if (window.confirm("Loading a scheme will replace the current diagram. Are you sure?")) {
            onLoad(schemeId);
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