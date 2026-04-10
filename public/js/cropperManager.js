/**
 * CropperManager - Centralized utility for handling image selection and cropping across KAVOX.
 * Enforces the "Strict Global Rule" of cropping before upload.
 */
const CropperManager = {
    cropper: null,
    currentFile: null,
    callback: null,
    aspectRatio: 1,
    modal: null,
    imageElement: null,

    /**
     * Initializes the Cropper for a file input
     * @param {File} file - The file selected from an input
     * @param {Object} options - Configuration (aspectRatio, width, height, callback)
     */
    init(file, options = {}) {
        if (!file) return;
        
        this.currentFile = file;
        this.aspectRatio = options.aspectRatio || 1;
        this.callback = options.callback || null;
        this.targetWidth = options.width || 500;
        this.targetHeight = options.height || 500;

        this.modal = document.getElementById('cropperModal');
        this.imageElement = document.getElementById('cropperImageGlobal');

        if (!this.modal || !this.imageElement) {
            console.error('CropperManager: Modal elements not found. Did you include partials/cropperModal.ejs?');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.imageElement.src = e.target.result;
            this.modal.style.display = 'flex';
            
            if (this.cropper) {
                this.cropper.destroy();
            }

            this.cropper = new Cropper(this.imageElement, {
                aspectRatio: this.aspectRatio,
                viewMode: 1,
                autoCropArea: 1,
                responsive: true,
                restore: false,
                checkOrientation: false,
                modal: true,
                guides: true,
                center: true,
                highlight: false,
                background: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        };
        reader.readAsDataURL(file);
    },

    /**
     * Saves the current crop and triggers the callback
     */
    save() {
        if (!this.cropper) return;

        const canvas = this.cropper.getCroppedCanvas({
            width: this.targetWidth,
            height: this.targetHeight,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        canvas.toBlob((blob) => {
            const fileName = this.currentFile.name.replace(/\.[^/.]+$/, "") + "_cropped.jpg";
            const croppedFile = new File([blob], fileName, { type: 'image/jpeg' });
            
            if (this.callback) {
                this.callback(croppedFile, URL.createObjectURL(blob));
            }
            
            this.close();
        }, 'image/jpeg', 0.9);
    },

    /**
     * Cancels the cropping process
     */
    cancel() {
        if (this.callback) {
            this.callback(null, null);
        }
        this.close();
    },

    /**
     * Internal cleanup
     */
    close() {
        if (this.modal) this.modal.style.display = 'none';
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        this.currentFile = null;
    }
};

window.CropperManager = CropperManager;
