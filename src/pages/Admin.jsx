import React, { useEffect } from "react";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// 👇 FIXED: Added explicit .js extension to the relative path
import { API_BASE_URL } from "../apiConfig.js"; 
import "./Admin.css";

const firebaseConfig = {
    apiKey: "AIzaSyBgH8hpWJ97mqLFfoDDW9A_78pR5YjEmxo", 
    authDomain: "jamba-wear.firebaseapp.com",
    projectId: "jamba-wear",
    storageBucket: "jamba-wear.firebasestorage.app",
    messagingSenderId: "679544590258",
    appId: "1:679544590258:web:eac3841e5f555e3fb89eab",
    measurementId: "G-8XSNJG079Z"
};

const appName = "jambawear-admin";
const app = getApps().some((firebaseApp) => firebaseApp.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export default function Admin() {
    useEffect(() => {

        function showSection(sectionId, clickedElement) {
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            if(clickedElement) clickedElement.classList.add('active');
        }

        window.showSection = showSection;

        function showToast(message) {
            const toast = document.getElementById('toast-notification');
            if(toast) {
                toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
                toast.classList.add('show');
                setTimeout(() => { toast.classList.remove('show'); }, 3000);
            }
        }

        window.updateCategoryOptions = function(gender, selectedCategory = "") {
            const categorySelect = document.getElementById('p-category');
            if(!categorySelect) return;
            
            const categoryMap = {
                "Women": ["Dokhona", "Fasra", "Blows", "Jwmgra"],
                "Men": ["Shirt", "Gamsa", "Waistcoat"],
                "Accessories": ["Aronai", "Bag", "Flowers"]
            };

            categorySelect.innerHTML = '<option value="" disabled selected>Select Category</option>';
            if (categoryMap[gender]) {
                categoryMap[gender].forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    if (cat === selectedCategory) option.selected = true;
                    categorySelect.appendChild(option);
                });
            }
        };

        const ALLOWED_ADMIN_EMAIL = "jamba4334@gmail.com";
        let hasBootstrapped = false;

        onAuthStateChanged(auth, async (user) => {
            const overlay = document.getElementById('login-overlay');
            if (user && user.email === ALLOWED_ADMIN_EMAIL) {
                if (overlay) overlay.style.display = 'none';
                if (!hasBootstrapped) {
                    hasBootstrapped = true;
                    await bootstrapData(); 
                }
            } else {
                if (overlay) overlay.style.display = 'flex';
            }
        });

        window.handleAdminLogin = async () => {
            const errorMsg = document.getElementById('login-error');
            try {
                const result = await signInWithPopup(auth, provider);
                if (result.user.email !== ALLOWED_ADMIN_EMAIL) {
                    await signOut(auth);
                    errorMsg.innerText = "Unauthorized email address.";
                    errorMsg.style.display = 'block';
                }
            } catch (error) {
                console.error("Login Error:", error);
                errorMsg.innerText = "Login failed: " + error.message;
                errorMsg.style.display = 'block';
            }
        };

        window.handleLogout = async () => {
            await signOut(auth);
            window.location.reload(); 
        };
        
        async function bootstrapData() {
            await loadAdminInventory(); 
            loadSiteSettings();
            loadAdminOrders(); 
            loadCustomerDetails();
        }

        let globalLiveProducts = [];
        let globalOrders = [];
        let globalCustomers = [];
        
        let editingProductId = null;
        let currentEditImageUrls = [];
        let selectedFiles = [];        
        let activeWomenVideoUrl = "";
        let activeMenVideoUrl = "";

        window.renderImagePreview = function() {
            const previewContainer = document.getElementById('image-preview-container');
            const promptContent = document.getElementById('upload-prompt-content');
            if(!previewContainer || !promptContent) return;

            previewContainer.innerHTML = ''; 
            const totalImages = currentEditImageUrls.length + selectedFiles.length;

            if (totalImages > 0) {
                promptContent.style.display = 'none';
                previewContainer.style.display = 'flex';

                let html = '';
                
                currentEditImageUrls.forEach((url, index) => {
                    html += `
                        <div style="position:relative; display:inline-block; margin: 4px;">
                            <img src="${url}" alt="Preview" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--input-border);">
                            <button type="button" onclick="window.removeEditImage(${index})" style="position:absolute; top:-8px; right:-8px; background:var(--danger); color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                });

                selectedFiles.forEach((file, index) => {
                    const objectUrl = URL.createObjectURL(file);
                    html += `
                        <div style="position:relative; display:inline-block; margin: 4px;">
                            <img src="${objectUrl}" alt="Preview" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid var(--success);">
                            <button type="button" onclick="window.removeNewImage(${index})" style="position:absolute; top:-8px; right:-8px; background:var(--danger); color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                });

                previewContainer.innerHTML = html;
            } else {
                promptContent.style.display = 'block';
                previewContainer.style.display = 'none';
            }
        };

        window.removeEditImage = function(index) {
            currentEditImageUrls.splice(index, 1);
            window.renderImagePreview();
        };

        window.removeNewImage = function(index) {
            selectedFiles.splice(index, 1);
            document.getElementById('file-upload').value = "";
            window.renderImagePreview();
        };

        window.handleFileSelect = function(e) {
            const files = Array.from(e.target.files);
            if (currentEditImageUrls.length + selectedFiles.length + files.length > 5) {
                alert("You can only have a maximum of 5 images per product.");
                e.target.value = "";
                return;
            }
            selectedFiles = selectedFiles.concat(files);
            e.target.value = ""; 
            window.renderImagePreview();
        };

        // 🚀 SERVER-SIDE ROUTING: Add / Update Product
        window.handleProductSubmit = async function(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing & Uploading...';

            try {
                let finalUrls = [...currentEditImageUrls];
                
                if (selectedFiles.length > 0) {
                    for (const file of selectedFiles) {
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("upload_preset", "jambawear_preset");
                        const res = await fetch("https://api.cloudinary.com/v1_1/dbbafwgug/image/upload", { method: "POST", body: formData });
                        const data = await res.json();
                        
                        if (data.secure_url) {
                            finalUrls.push(data.secure_url);
                        } else {
                            throw new Error(data.error?.message || "Image upload failed.");
                        }
                    }
                }

                if (finalUrls.length === 0) throw new Error("Please upload at least 1 image for this product.");

                const productData = {
                    title: document.getElementById('p-name').value || "",
                    original_price: parseFloat(document.getElementById('p-original-price').value) || 0,
                    selling_price: parseFloat(document.getElementById('p-price').value) || 0,
                    category: (document.getElementById('p-category').value || "") + " - " + (document.getElementById('p-gender').value || ""),
                    placement: document.getElementById('p-placement').value || "regular",
                    images: finalUrls,
                    description: document.getElementById('p-desc').value || "",
                    color: document.getElementById('p-color').value || "",
                    fabric: document.getElementById('p-fabric').value || "",
                    sellerName: document.getElementById('s-name').value || "",
                    brandName: document.getElementById('s-brand').value || "",
                    sellerPhone: document.getElementById('s-phone').value || "",
                    sellerEmail: document.getElementById('s-email').value || "",
                    sellerAddress: document.getElementById('s-address').value || "",
                    pickupAddress: document.getElementById('s-pickup').value || "",
                    city: document.getElementById('s-city').value || "",
                    state: document.getElementById('s-state').value || "",
                    pincode: document.getElementById('s-pincode').value || "",
                    allow_cod: document.getElementById('p-pay-cod').checked,
                    allow_online: document.getElementById('p-pay-online').checked,
                    isHidden: false,
                    isOutOfStock: false 
                };

                const method = editingProductId ? "PUT" : "POST";
                const endpoint = editingProductId ? `${API_BASE_URL}/admin/products/${editingProductId}` : `${API_BASE_URL}/admin/products`;

                const response = await fetch(endpoint, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(productData)
                });

                if (!response.ok) throw new Error("Failed to save product on server.");

                showToast(editingProductId ? "Product Updated Successfully!" : "New Product Added Successfully!");

                document.getElementById('new-product-form').reset();
                document.getElementById('p-pay-cod').checked = true; 
                document.getElementById('p-pay-online').checked = true; 
                
                editingProductId = null;
                currentEditImageUrls = [];
                selectedFiles = [];
                window.renderImagePreview();

                showSection('live-products', document.querySelectorAll('.nav-item')[0]);
                loadAdminInventory();
            } catch (err) { 
                alert("Error saving product: " + err.message); 
            } finally { 
                submitBtn.disabled = false; 
                submitBtn.innerText = editingProductId ? "Save Product Updates" : "Save Product to Database"; 
            }
        };

        window.cancelEdit = function() {
            document.getElementById('new-product-form').reset();
            document.getElementById('p-pay-cod').checked = true; 
            document.getElementById('p-pay-online').checked = true; 
            
            editingProductId = null;
            currentEditImageUrls = [];
            selectedFiles = [];
            window.renderImagePreview();

            document.getElementById('submit-btn').innerText = "Save Product to Database";
            document.getElementById('cancel-edit-btn').style.display = "none";
            showSection('live-products', document.querySelectorAll('.nav-item')[0]);
        };

        // 🚀 SERVER-SIDE ROUTING: Toggle Visibility
        window.toggleProductHide = async function(productId, newState) {
            await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                method: "PUT",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isHidden: newState })
            });
            loadAdminInventory();
        };

        // 🚀 SERVER-SIDE ROUTING: Toggle Stock
        window.toggleProductStock = async function(productId, newState) {
            await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                method: "PUT",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isOutOfStock: newState })
            });
            loadAdminInventory();
        };

        // 🚀 SERVER-SIDE ROUTING: Delete Product
        window.deleteProduct = async function(productId) {
            if(confirm("Are you sure you want to completely delete this product?")) {
                await fetch(`${API_BASE_URL}/admin/products/${productId}`, { method: "DELETE" });
                loadAdminInventory();
            }
        };

        window.editProduct = function(encodedProduct) {
            const product = JSON.parse(decodeURIComponent(encodedProduct));
            editingProductId = product.docId;

            document.getElementById('p-name').value = product.title || "";
            document.getElementById('p-original-price').value = product.original_price || product.selling_price || 0;
            document.getElementById('p-price').value = product.selling_price || 0;
            document.getElementById('p-placement').value = product.placement || "regular";
            
            const parts = (product.category || "").split(' - ');
            const catName = parts[0] ? parts[0].trim() : '';
            const genName = parts[1] ? parts[1].trim() : '';
            
            document.getElementById('p-gender').value = genName;
            window.updateCategoryOptions(genName, catName);

            document.getElementById('p-color').value = product.color || "";
            document.getElementById('p-fabric').value = product.fabric || "";
            document.getElementById('p-desc').value = product.description || "";
            
            document.getElementById('s-name').value = product.sellerName || '';
            document.getElementById('s-brand').value = product.brandName || '';
            document.getElementById('s-phone').value = product.sellerPhone || '';
            document.getElementById('s-email').value = product.sellerEmail || '';
            document.getElementById('s-address').value = product.sellerAddress || '';
            document.getElementById('s-pickup').value = product.pickupAddress || '';
            document.getElementById('s-city').value = product.city || '';
            document.getElementById('s-state').value = product.state || '';
            document.getElementById('s-pincode').value = product.pincode || '';

            document.getElementById('p-pay-cod').checked = product.allow_cod !== false; 
            document.getElementById('p-pay-online').checked = product.allow_online !== false; 

            currentEditImageUrls = product.images || [];
            selectedFiles = [];
            window.renderImagePreview();

            document.getElementById('submit-btn').innerText = "Save Product Updates";
            document.getElementById('cancel-edit-btn').style.display = "block";
            showSection('add-product', document.querySelectorAll('.nav-item')[1]);
        };

        // CMS settings kept direct to Firebase for simplicity
        async function loadSiteSettings() {
            try {
                const docRef = doc(db, "settings", "hero_banners");
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    activeWomenVideoUrl = data.women_video || "";
                    activeMenVideoUrl = data.men_video || "";
                    
                    document.getElementById('current-women-status').innerText = activeWomenVideoUrl ? "Live Video Found ✓" : "No Video Uploaded";
                    document.getElementById('current-men-status').innerText = activeMenVideoUrl ? "Live Video Found ✓" : "No Video Uploaded";
                    
                    if(data.promo_text) {
                        document.getElementById('setting-promo-text').value = data.promo_text;
                    }

                    if(data.login_image_url) {
                        const loginImgInput = document.getElementById('setting-login-image');
                        if (loginImgInput) {
                            loginImgInput.value = data.login_image_url;
                            window.updateLoginImagePreview(data.login_image_url);
                        }
                    }

                } else {
                    document.getElementById('current-women-status').innerText = "No Video Uploaded";
                    document.getElementById('current-men-status').innerText = "No Video Uploaded";
                }
            } catch (error) { console.error("Error loading site settings:", error); }
        }

        window.updateLoginImagePreview = function(url) {
            const previewDiv = document.getElementById('login-image-preview');
            if(url && url.trim() !== '') {
                previewDiv.style.display = 'block';
                previewDiv.style.backgroundImage = `url(${url})`;
            } else {
                previewDiv.style.display = 'none';
            }
        };

        window.handleLoginImageUpdate = async function() {
            const btn = document.getElementById('update-login-img-btn');
            const msg = document.getElementById('login-img-status-msg');
            const newUrl = document.getElementById('setting-login-image').value;

            btn.disabled = true;
            btn.innerText = "Saving...";

            try {
                await setDoc(doc(db, "settings", "hero_banners"), {
                    login_image_url: newUrl,
                    last_updated: new Date().toISOString()
                }, { merge: true }); 

                showToast("Login Image updated successfully!");
                msg.innerText = "";
            } catch (error) {
                msg.innerText = "❌ Update Error: " + error.message;
                msg.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Update Login Image";
            }
        };

        window.handlePromoUpdate = async function() {
            const btn = document.getElementById('update-promo-btn');
            const msg = document.getElementById('promo-status-msg');
            const newText = document.getElementById('setting-promo-text').value;

            btn.disabled = true;
            btn.innerText = "Saving...";

            try {
                await setDoc(doc(db, "settings", "hero_banners"), {
                    promo_text: newText,
                    last_updated: new Date().toISOString()
                }, { merge: true }); 

                showToast("Banner text updated successfully!");
            } catch (error) {
                msg.innerText = "❌ Update Error: " + error.message;
                msg.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Update Banner Text";
            }
        };

        window.handleSettingsUpdate = async function() {
            const btn = document.getElementById('update-settings-btn');
            const msg = document.getElementById('setting-status-msg');
            
            const womenFile = document.getElementById('setting-women-video-file').files[0];
            const menFile = document.getElementById('setting-men-video-file').files[0];

            if (!womenFile && !menFile) {
                msg.innerText = "Please select at least one video file to upload.";
                msg.style.color = "var(--accent)";
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Videos...';
            msg.innerText = "Uploading large files may take a minute. Do not refresh the page.";
            msg.style.color = "var(--text-main)";

            try {
                let finalWomenUrl = activeWomenVideoUrl;
                let finalMenUrl = activeMenVideoUrl;

                if (womenFile) {
                    const womenRef = ref(storage, 'hero_videos/women_hero.mp4');
                    await uploadBytes(womenRef, womenFile);
                    finalWomenUrl = await getDownloadURL(womenRef);
                }

                if (menFile) {
                    const menRef = ref(storage, 'hero_videos/men_hero.mp4');
                    await uploadBytes(menRef, menFile);
                    finalMenUrl = await getDownloadURL(menRef);
                }

                await setDoc(doc(db, "settings", "hero_banners"), {
                    women_video: finalWomenUrl,
                    men_video: finalMenUrl,
                    last_updated: new Date().toISOString()
                }, { merge: true });

                showToast("Videos uploaded successfully!");
                msg.innerText = "";
                document.getElementById('setting-women-video-file').value = "";
                document.getElementById('setting-men-video-file').value = "";
                loadSiteSettings();

            } catch (error) {
                msg.innerText = "❌ Upload Error: " + error.message;
                msg.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Upload & Update Banners";
            }
        };

        // 🚀 SERVER-SIDE ROUTING: Fetch Products
        async function loadAdminInventory() {
            try {
                const response = await fetch(`${API_BASE_URL}/admin/products`);
                if (!response.ok) throw new Error("Failed to load inventory.");
                
                const data = await response.json();
                globalLiveProducts = data;
                globalLiveProducts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                renderInventoryList(globalLiveProducts);
            } catch (err) {
                console.error("Inventory Load Error:", err);
            }
        }

        function renderInventoryList(productsToRender) {
            const inventoryList = document.getElementById('admin-inventory-list');
            if(!inventoryList) return;
            inventoryList.innerHTML = ''; 
            
            if(productsToRender.length === 0) {
                inventoryList.innerHTML = '<p style="padding: 20px; color: var(--text-muted); font-weight: 500;">No matching products found.</p>';
                return;
            }

            productsToRender.forEach((product) => {
                let mainImgUrl = (product.images && product.images.length > 0) ? product.images[0] : "https://via.placeholder.com/150";
                
                if (mainImgUrl.includes('res.cloudinary.com') && mainImgUrl.includes('/upload/')) {
                    mainImgUrl = mainImgUrl.replace('/upload/', '/upload/w_150,c_fill,q_auto/');
                }

                const productJson = encodeURIComponent(JSON.stringify(product));
                
                const placementText = product.placement === 'hero' ? '<span class="hero-badge"><i class="fa-solid fa-star"></i> Hero</span>' : '';
                const hiddenBadge = product.isHidden ? '<span class="hero-badge" style="background-color: #9CA3AF;"><i class="fa-solid fa-eye-slash"></i> Hidden</span>' : '';
                const oosBadge = product.isOutOfStock ? '<span class="hero-badge" style="background-color: var(--danger);"><i class="fa-solid fa-ban"></i> Out Of Stock</span>' : '';
                
                const isHidden = product.isHidden || false;
                const isOOS = product.isOutOfStock || false;

                const hideBtnText = isHidden ? '<i class="fa-solid fa-eye-slash"></i> Hidden' : '<i class="fa-solid fa-eye"></i> Visible';
                const hideBtnClass = isHidden ? 'btn-status-hidden' : 'btn-status-active';

                const stockBtnText = isOOS ? '<i class="fa-solid fa-ban"></i> Out of Stock' : '<i class="fa-solid fa-box"></i> In Stock';
                const stockBtnClass = isOOS ? 'btn-status-inactive' : 'btn-status-active';

                const dateStr = product.created_at ? new Date(product.created_at).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Unknown Date';

                let displayCategory = product.category || 'N/A';
                if (displayCategory.includes('-')) {
                    const parts = displayCategory.split('-');
                    if (parts.length === 2) {
                        const p1 = parts[0].trim();
                        const p2 = parts[1].trim();
                        if (p2.toLowerCase() === 'men' || p2.toLowerCase() === 'women' || p2.toLowerCase() === 'accessories') { displayCategory = p2 + ' ' + p1; } 
                        else if (p1.toLowerCase() === 'men' || p1.toLowerCase() === 'women' || p1.toLowerCase() === 'accessories') { displayCategory = p1 + ' ' + p2; } 
                        else { displayCategory = p1 + ' ' + p2; }
                    }
                }

                inventoryList.innerHTML += `
                <div class="card" style="display: flex; gap: 24px; padding: 24px;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 2px;">
                            ID: ${product.item_id || product.docId} ${placementText} ${hiddenBadge} ${oosBadge}
                        </div>
                        <div style="font-size: 11px; color: #9CA3AF; margin-bottom: 8px;">
                            <i class="fa-regular fa-clock"></i> Uploaded: ${dateStr}
                        </div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--primary); margin-bottom: 4px;">${product.title}</div>
                        <div style="font-size: 14px; color: var(--text-main); margin-bottom: 16px;">
                            <span style="font-weight: 600;">₹${product.selling_price}</span> &nbsp;<span style="color:#d1d5db;">|</span>&nbsp; ${displayCategory}
                        </div>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding-top: 16px; border-top: 1px solid #f3f4f6;">
                            <button class="action-btn btn-edit" onclick="window.editProduct('${productJson}')"><i class="fa-solid fa-pen"></i> Edit Details</button>
                            <div style="width: 1px; height: 16px; background: #e5e7eb; margin: 0 4px;"></div>
                            <button class="action-btn ${hideBtnClass}" onclick="window.toggleProductHide('${product.docId}', ${!isHidden})">${hideBtnText}</button>
                            <button class="action-btn ${stockBtnClass}" onclick="window.toggleProductStock('${product.docId}', ${!isOOS})">${stockBtnText}</button>
                            <div style="flex-grow: 1;"></div>
                            <button class="action-btn btn-delete" onclick="window.deleteProduct('${product.docId}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <img src="${mainImgUrl}" style="width:110px; height:110px; object-fit:cover; border-radius:8px; border: 1px solid #e5e7eb;">
                </div>`;
            });
        }

        window.filterInventory = function(type, btn) {
            const subFilterRow = document.getElementById('regular-sub-filters');
            document.querySelectorAll('.filter-group .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (type === 'all') {
                subFilterRow.style.display = 'none';
                renderInventoryList(globalLiveProducts);
            } else if (type === 'hero') {
                subFilterRow.style.display = 'none';
                renderInventoryList(globalLiveProducts.filter(p => p.placement === 'hero'));
            } else if (type === 'regular') {
                subFilterRow.style.display = 'flex';
                document.querySelectorAll('#regular-sub-filters .filter-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('#regular-sub-filters .filter-btn').classList.add('active');
                renderInventoryList(globalLiveProducts.filter(p => (p.placement || 'regular') === 'regular'));
            }
        };

        window.filterByGender = function(gender, btn) {
            document.querySelectorAll('#regular-sub-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const regularItems = globalLiveProducts.filter(p => (p.placement || 'regular') === 'regular');
            
            if (gender === 'all') { renderInventoryList(regularItems); } 
            else { renderInventoryList(regularItems.filter(p => p.category && p.category.toLowerCase().includes(gender.toLowerCase()))); }
        };

        // 🚀 SERVER-SIDE ROUTING: Fetch Orders
        async function loadAdminOrders() {
            try {
                const response = await fetch(`${API_BASE_URL}/admin/orders`);
                if (!response.ok) throw new Error("Failed to load orders.");
                
                const data = await response.json();
                globalOrders = data;
                globalOrders.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
                renderOrdersList(globalOrders);
            } catch (error) {
                console.error("Error loading orders:", error);
                document.getElementById('admin-orders-list').innerHTML = `<p style="padding: 20px; color: var(--danger); font-weight: bold;">Failed to load orders.</p>`;
            }
        }

        // 🚀 SERVER-SIDE ROUTING: Update Order Status
        window.updateOrderStatus = async function(orderId, newStatus) {
            if(confirm(`Are you sure you want to mark this order as ${newStatus.toUpperCase()}?`)) {
                try {
                    await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                        method: "PUT",
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    loadAdminOrders();
                    showToast("Order Status Updated");
                } catch(e) {
                    alert("Error updating order: " + e.message);
                }
            }
        };

        // 🚀 SERVER-SIDE ROUTING: Update Tracking Info
        window.updateTrackingInfo = async function(orderId) {
            const trackingId = document.getElementById(`tracking-id-${orderId}`).value;
            const courierName = document.getElementById(`courier-name-${orderId}`).value;

            if (!trackingId || !courierName) {
                alert("Please enter both Courier Service Name and Tracking ID.");
                return;
            }

            const btn = document.getElementById(`track-btn-${orderId}`);
            btn.innerText = "Saving...";
            btn.disabled = true;

            try {
                await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                    method: "PUT",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trackingId: trackingId, courierName: courierName })
                });
                showToast("Tracking Info Saved Successfully!");
            } catch(e) {
                alert("Error saving tracking info: " + e.message);
            } finally {
                btn.innerText = "Save Tracking";
                btn.disabled = false;
            }
        };

        window.filterOrders = function(status, btn) {
            const buttons = btn.parentElement.querySelectorAll('.filter-btn');
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (status === 'all') {
                renderOrdersList(globalOrders);
            } else {
                const filtered = globalOrders.filter(order => {
                    const currentStatus = order.status ? order.status.toLowerCase() : 'pending';
                    if (status === 'pending') return currentStatus === 'pending' || currentStatus === 'created';
                    return currentStatus === status;
                });
                renderOrdersList(filtered);
            }
        };

        window.copyAddress = function(name, phone, add1, landmark, district, state, pin) {
            const formattedAddress = `${name}\nPhone: ${phone}\n${add1}\n${landmark ? landmark + '\n' : ''}${district}, ${state} - ${pin}`;
            navigator.clipboard.writeText(formattedAddress).then(() => {
                showToast("Shipping address copied!");
            }).catch(err => {
                console.error("Failed to copy text: ", err);
            });
        };

        function renderOrdersList(ordersToRender) {
            const ordersList = document.getElementById('admin-orders-list');
            if(!ordersList) return;
            ordersList.innerHTML = ''; 
            
            if(ordersToRender.length === 0) {
                ordersList.innerHTML = '<p style="padding: 20px; color: var(--text-muted); font-weight: 500;">No orders found matching your search.</p>';
                return;
            }

            ordersToRender.forEach(order => {
                const currentStatus = order.status ? order.status.toLowerCase() : 'pending';
                
                let statusBadge = '';
                if (currentStatus === 'paid') {
                    statusBadge = '<span class="hero-badge" style="background-color: var(--success);"><i class="fa-solid fa-check"></i> PAID</span>';
                } else if (currentStatus === 'shipped') {
                    statusBadge = '<span class="hero-badge" style="background-color: var(--primary);"><i class="fa-solid fa-plane"></i> SHIPPED</span>';
                } else if (currentStatus === 'cancelled') {
                    statusBadge = '<span class="hero-badge" style="background-color: var(--danger);"><i class="fa-solid fa-xmark"></i> CANCELLED</span>';
                } else {
                    statusBadge = '<span class="hero-badge" style="background-color: var(--accent);"><i class="fa-solid fa-hourglass-half"></i> PENDING</span>';
                }

                const customerName = order.shippingAddress?.name || 'Guest Customer';
                const customerEmail = order.email || 'No Email';
                const customerPhone = order.shippingAddress?.phone || order.customerContact || 'No Phone';

                let redBoxHtml = '<div style="color: var(--text-muted);">No address provided</div>';
                if (order.shippingAddress) {
                    const safeName = (order.shippingAddress.name || '').replace(/'/g, "\\'");
                    const safeAdd = (order.shippingAddress.address1 || '').replace(/'/g, "\\'");
                    const safeLand = (order.shippingAddress.landmark || '').replace(/'/g, "\\'");
                    
                    redBoxHtml = `
                        <strong style="color: var(--primary); display:flex; align-items: center; gap: 6px; margin-bottom:12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;">
                            <i class="fa-solid fa-location-dot" style="color: #ef4444;"></i> Delivery Address
                        </strong>
                        <div style="color: var(--text-main); line-height: 1.5;">
                            ${order.shippingAddress.address1}${order.shippingAddress.landmark ? `, ${order.shippingAddress.landmark}` : ''}<br>
                            ${order.shippingAddress.district}, ${order.shippingAddress.state} - <strong style="color: var(--primary);">${order.shippingAddress.pincode}</strong>
                        </div>
                        <button class="action-btn" style="margin-top: 12px; background: white; border: 1px solid #d1d5db; padding: 4px 8px; font-size:11px;" 
                                onclick="window.copyAddress('${safeName}', '${customerPhone}', '${safeAdd}', '${safeLand}', '${order.shippingAddress.district}', '${order.shippingAddress.state}', '${order.shippingAddress.pincode}')">
                            <i class="fa-regular fa-copy"></i> Copy Address
                        </button>
                    `;
                }

                let sellerName = 'N/A', brandName = 'N/A', sellerPhone = 'N/A', sellerEmail = 'N/A', sellerAddress = 'N/A', pickupAddress = 'N/A', city = '', state = '', pincode = '';
                if (order.items && order.items.length > 0) {
                    const firstItem = order.items[0];
                    const liveProduct = globalLiveProducts.find(p => p.docId === firstItem.id || p.item_id === firstItem.item_id || p.title === firstItem.title);
                    const source = liveProduct || firstItem; 
                    
                    sellerName = source.sellerName || 'N/A';
                    brandName = source.brandName || 'N/A';
                    sellerPhone = source.sellerPhone || 'N/A';
                    sellerEmail = source.sellerEmail || 'N/A';
                    sellerAddress = source.sellerAddress || 'N/A';
                    pickupAddress = source.pickupAddress || 'N/A';
                    city = source.city || '';
                    state = source.state || '';
                    pincode = source.pincode || '';
                }

                const locationStr = city ? `${city}, ${state} - ${pincode}` : '';

                const blackBoxHtml = `
                    <strong style="color: var(--primary); display:flex; align-items: center; gap: 6px; margin-bottom:12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;">
                        <i class="fa-solid fa-store" style="color: #4b5563;"></i> Seller Details
                    </strong>
                    <div style="color: var(--text-main); line-height: 1.5;">
                        <strong>Brand:</strong> ${brandName}<br>
                        <strong>Seller:</strong> ${sellerName} <br>
                        <a href="tel:${sellerPhone}" style="color: var(--text-muted); text-decoration: none;"><i class="fa-solid fa-phone"></i> ${sellerPhone}</a>
                    </div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e5e7eb; color: var(--text-muted); line-height: 1.4;">
                        <span style="font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Pickup Location</span><br>
                        ${pickupAddress}<br>
                        ${locationStr}
                    </div>
                `;

                let blueBoxHtml = '<div style="color: var(--text-muted);">No items data</div>';
                if (order.items && order.items.length > 0) {
                    blueBoxHtml = `
                        <strong style="color: var(--primary); display:flex; align-items: center; gap: 6px; margin-bottom:12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;">
                            <i class="fa-solid fa-box-open" style="color: #3b82f6;"></i> Order Items
                        </strong>
                        <div style="max-height: 150px; overflow-y: auto; padding-right: 5px;">
                    ` + order.items.map(i => `
                        <div style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #eee;">
                            <img src="${i.image || 'https://via.placeholder.com/80x100'}" style="width: 50px; height: 60px; min-width: 50px; object-fit: cover; border-radius: 4px; border: 1px solid var(--input-border); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="line-height: 1.4; font-size:13px; padding-top: 2px;">
                                <strong style="font-size: 13px;">${i.quantity}x</strong> ${i.title} <br>
                                <span style="color: var(--text-muted);">Size: ${i.size || 'N/A'}</span><br>
                                <span style="font-weight: 600; color: var(--primary);">₹${i.price || i.selling_price || ''}</span>
                            </div>
                        </div>
                    `).join('') + `</div>`;
                }

                let adminActions = '';
                if (currentStatus === 'pending' || currentStatus === 'created') {
                    adminActions = `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 10px;">
                            <button class="action-btn btn-status-active" onclick="window.updateOrderStatus('${order.id}', 'paid')">
                                <i class="fa-solid fa-check-double"></i> Verify Payment
                            </button>
                            <button class="action-btn btn-delete" onclick="window.updateOrderStatus('${order.id}', 'cancelled')">
                                <i class="fa-solid fa-xmark"></i> Reject
                            </button>
                        </div>`;
                } else if (currentStatus === 'paid') {
                    adminActions = `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                            <button class="action-btn btn-edit" style="width: 100%;" onclick="window.updateOrderStatus('${order.id}', 'shipped')">
                                <i class="fa-solid fa-truck-fast"></i> Mark as Shipped
                            </button>
                        </div>`;
                }

                const pMethod = order.payment_method || order.paymentMethod;
                const isCOD = pMethod && pMethod.toUpperCase() === 'COD';
                const paymentTypeBadge = isCOD 
                    ? `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 6px 12px; border-radius: 4px; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;"><i class="fa-solid fa-money-bill-wave"></i> CASH ON DELIVERY</span>`
                    : `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 4px; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;"><i class="fa-solid fa-credit-card"></i> ONLINE PREPAID</span>`;

                const existingCourier = order.courierName || '';
                const existingTracking = order.trackingId || '';

                const trackingHtml = `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #e5e7eb; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <input type="text" id="courier-name-${order.id}" value="${existingCourier}" placeholder="Courier Name (e.g. Delhivery)" class="input-box" style="padding: 8px 12px; flex: 1; min-width: 150px;">
                        <input type="text" id="tracking-id-${order.id}" value="${existingTracking}" placeholder="Tracking ID (e.g. 123456789)" class="input-box" style="padding: 8px 12px; flex: 1; min-width: 150px;">
                        <button id="track-btn-${order.id}" class="action-btn" onclick="window.updateTrackingInfo('${order.id}')" style="padding: 9px 16px; background: var(--primary); color: white; border: none; font-weight: 600;">
                            Save Tracking
                        </button>
                    </div>
                `;

                ordersList.innerHTML += `
                    <div class="card" style="padding: 24px; margin-bottom: 20px;">
                        
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 16px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">Order Ref: ${order.razorpay_order_id || order.id}</div>
                                
                                <div style="font-size: 13px; font-weight: 500; color: var(--primary); border: 1px solid #e5e7eb; background: #f9fafb; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                                    <span><i class="fa-solid fa-user" style="color: var(--text-muted);"></i> ${customerName}</span>
                                    <span style="color: #d1d5db;">|</span>
                                    <span><i class="fa-solid fa-envelope" style="color: var(--text-muted);"></i> ${customerEmail}</span>
                                    <span style="color: #d1d5db;">|</span>
                                    <span><i class="fa-solid fa-phone" style="color: var(--text-muted);"></i> ${customerPhone}</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 18px; font-weight: bold; color: var(--primary);">₹${order.total || order.totalAmount}</div>
                                <div style="margin-top: 6px;">${statusBadge}</div>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 20px;">
                            
                            <div style="border: 1px solid #e5e7eb; border-top: 3px solid #ef4444; padding: 16px; border-radius: 6px; font-size: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                ${redBoxHtml}
                            </div>

                            <div style="border: 1px solid #e5e7eb; border-top: 3px solid #4b5563; padding: 16px; border-radius: 6px; font-size: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                ${blackBoxHtml}
                            </div>

                            <div style="border: 1px solid #e5e7eb; border-top: 3px solid #3b82f6; padding: 16px; border-radius: 6px; font-size: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                ${blueBoxHtml}
                            </div>

                        </div>

                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 20px; display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #f3f4f6; flex-wrap: wrap; gap: 10px;">
                            <div>
                                <span style="display: block; margin-bottom: 4px;">Date: ${new Date(order.created_at || order.createdAt).toLocaleString()}</span>
                                <span>Payment ID: ${order.payment_id || order.razorpay_id || 'N/A'}</span>
                            </div>
                            <div>
                                ${paymentTypeBadge}
                            </div>
                        </div>
                        ${trackingHtml}
                        ${adminActions}
                    </div>`;
            });
        }

        window.handleOrderSearch = function(searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            
            const activeTabBtn = document.querySelector('#orders .filter-btn.active');
            let currentStatusFilter = 'all';
            
            if (activeTabBtn) {
                if (activeTabBtn.innerText.includes('Needs Verification')) currentStatusFilter = 'pending';
                else if (activeTabBtn.innerText.includes('Ready to Ship')) currentStatusFilter = 'paid';
                else if (activeTabBtn.innerText.includes('Shipped')) currentStatusFilter = 'shipped';
            }

            const filteredOrders = globalOrders.filter(order => {
                const orderId = (order.razorpay_order_id || order.id || "").toLowerCase();
                const contactInfo = (order.email || order.customerContact || "").toLowerCase();
                const orderStatus = order.status ? order.status.toLowerCase() : 'pending';
                
                let addressString = "";
                if (order.shippingAddress) {
                    addressString = `${order.shippingAddress.name} ${order.shippingAddress.phone} ${order.shippingAddress.district} ${order.shippingAddress.state}`.toLowerCase();
                }
                
                const matchesSearch = orderId.includes(lowerTerm) || contactInfo.includes(lowerTerm) || addressString.includes(lowerTerm);
                
                if (currentStatusFilter === 'all') return matchesSearch;
                if (currentStatusFilter === 'pending') return matchesSearch && (orderStatus === 'pending' || orderStatus === 'created');
                return matchesSearch && orderStatus === currentStatusFilter;
            });
            
            renderOrdersList(filteredOrders);
        };

        // 🚀 SERVER-SIDE ROUTING: Fetch Customers
        async function loadCustomerDetails() {
            try {
                const response = await fetch(`${API_BASE_URL}/admin/customers`);
                if (!response.ok) throw new Error("Failed to load customers.");
                
                const data = await response.json();
                globalCustomers = data;
                globalCustomers.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
                renderCustomerList(globalCustomers);
            } catch (error) {
                console.error("Error loading customers:", error);
                document.getElementById('admin-customers-list').innerHTML = `<p style="padding: 20px; color: var(--danger); font-weight: bold;">Failed to load customer details.</p>`;
            }
        }

        function renderCustomerList(customersToRender) {
            const customerList = document.getElementById('admin-customers-list');
            if(!customerList) return;
            customerList.innerHTML = ''; 
            
            if(customersToRender.length === 0) {
                customerList.innerHTML = '<p style="padding: 20px; color: var(--text-muted); font-weight: 500;">No customers found matching your search.</p>';
                return;
            }

            customersToRender.forEach(user => {
                const roleBadge = user.role === 'admin' 
                    ? `<span class="hero-badge" style="background-color: var(--primary);">ADMIN</span>` 
                    : `<span class="hero-badge" style="background-color: var(--success);">CUSTOMER</span>`;
                
                const dateStr = (user.createdAt || user.created_at) ? new Date(user.createdAt || user.created_at).toLocaleString() : 'N/A';
                const contactInfo = user.email ? user.email : (user.phone ? user.phone : 'No Contact Info Provided');
                
                let savedAddrHtml = '';
                if (user.address) {
                    savedAddrHtml = `
                        <div style="margin-top: 16px; font-size: 12px; color: var(--text-muted); padding-top: 16px; border-top: 1px dashed #eee;">
                            <strong style="color: var(--text-main);">Saved Primary Address:</strong><br>
                            ${user.address.name} - ${user.address.phone}<br>
                            ${user.address.address1}, ${user.address.landmark}<br>
                            ${user.address.district}, ${user.address.state} - ${user.address.pincode}
                        </div>`;
                }

                customerList.innerHTML += `
                    <div class="card" style="padding: 24px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-size: 16px; font-weight: 600; color: var(--primary); margin-bottom: 4px;">
                                    ${user.name || 'Unknown User'} ${roleBadge}
                                </div>
                                <div style="font-size: 14px; color: var(--text-main);">
                                    <i class="fa-regular fa-envelope" style="margin-right: 4px;"></i> ${contactInfo}
                                </div>
                                <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                                    Joined: ${dateStr} &nbsp;|&nbsp; UID: ${user.id}
                                </div>
                            </div>
                        </div>
                        ${savedAddrHtml}
                    </div>`;
            });
        }

        window.handleCustomerSearch = function(searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            const filteredCustomers = globalCustomers.filter(user => {
                const name = (user.name || "").toLowerCase();
                const contactInfo = (user.email || user.phone || "").toLowerCase();
                
                let addressString = "";
                if (user.address) {
                    addressString = `${user.address.name} ${user.address.phone} ${user.address.district} ${user.address.state}`.toLowerCase();
                }

                return name.includes(lowerTerm) || contactInfo.includes(lowerTerm) || addressString.includes(lowerTerm);
            });
            renderCustomerList(filteredCustomers);
        };

    }, []);

    return (
        <div className="admin-isolated-wrapper">
            <div id="toast-notification" className="toast-notification"></div>

            <div id="login-overlay">
                <div className="login-box" style={{ textAlign: 'center' }}>
                    <h2><span style={{ color: 'var(--accent)' }}>JAMBA</span>WEAR Admin</h2>
                    <p>Please log in with your authorized Google account.</p>
                    <div className="login-error" id="login-error" style={{ display: 'none', marginBottom: '15px' }}>Unauthorized email address.</div>
                    
                    <button className="btn-submit" onClick={() => window.handleAdminLogin()} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <i className="fa-brands fa-google"></i> Sign In With Google
                    </button>
                </div>
            </div>

            <nav className="sidebar">
                <div className="logo-container">
                    <span className="logo-text"><span className="logo-jamba">JAMBA</span>WEAR</span>
                </div>
                <ul className="nav-menu">
                    <li className="nav-item active" onClick={(event) => window.showSection('live-products', event.currentTarget)}><i className="fa-solid fa-layer-group"></i> Inventory</li>
                    <li className="nav-item" onClick={(event) => window.showSection('add-product', event.currentTarget)}><i className="fa-solid fa-plus"></i> Add Product</li>
                    <li className="nav-item" onClick={(event) => window.showSection('orders', event.currentTarget)}><i className="fa-solid fa-truck"></i> Orders</li>
                    <li className="nav-item" onClick={(event) => window.showSection('site-settings', event.currentTarget)}><i className="fa-solid fa-sliders"></i> Site Settings</li>
                    <li className="nav-item" onClick={(event) => window.showSection('customer-details', event.currentTarget)}><i className="fa-solid fa-user-group"></i> Customers</li>
                </ul>
            </nav>

            <div className="main-pannel">
                <div className="header">
                    <h1>Dashboard</h1>
                    <button className="btn-login" onClick={() => window.handleLogout()}>Logout Admin</button>
                </div>

                <div id="live-products" className="content-section active">
                    <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--input-border)', paddingBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="section-title">Current Inventory</span>
                            <div className="filter-group">
                                <button className="filter-btn active" onClick={(event) => window.filterInventory('all', event.currentTarget)}>All</button>
                                <button className="filter-btn" onClick={(event) => window.filterInventory('hero', event.currentTarget)}>Homepage Hero</button>
                                <button className="filter-btn" onClick={(event) => window.filterInventory('regular', event.currentTarget)}>Regular Collection</button>
                            </div>
                        </div>

                        <div id="regular-sub-filters" style={{ display: 'none', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #e5e7eb' }}>
                            <span className="label" style={{ alignSelf: 'center', marginRight: '8px' }}>Filter Regular:</span>
                            <button className="filter-btn active" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('all', event.currentTarget)}>All Categories</button>
                            <button className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Men', event.currentTarget)}>Men Only</button>
                            <button className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Women', event.currentTarget)}>Women Only</button>
                            <button className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Accessories', event.currentTarget)}>Accessories Only</button>
                        </div>
                    </div>
                    <div id="admin-inventory-list">
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading inventory from database...</p>
                    </div>
                </div>

                <div id="add-product" className="content-section">
                    <span className="section-title" style={{ marginBottom: '24px' }}>Catalogue Management</span>
                    
                    <form className="card" id="new-product-form" onSubmit={(e) => window.handleProductSubmit(e)}>
                        
                        <span className="section-subtitle">Product Details</span>
                        <div className="field-grid">
                            <div className="form-group"><span className="label">Product Name</span><input type="text" id="p-name" className="input-box" placeholder="e.g. Classic Bodo Waistcoat" required /></div>
                            <div className="form-group"><span className="label">Original Price (₹)</span><input type="number" id="p-original-price" className="input-box" placeholder="2500" required min="0" /></div>
                            <div className="form-group"><span className="label">Selling Price (₹)</span><input type="number" id="p-price" className="input-box" placeholder="1999" required min="0" /></div>
                        </div>
                        
                        <div className="field-grid">
                            <div className="form-group">
                                <span className="label">Department / Gender</span> 
                                <select id="p-gender" className="input-box" required defaultValue="" onChange={(e) => window.updateCategoryOptions(e.target.value)}>
                                    <option value="" disabled>Select Department</option>
                                    <option value="Women">Women</option>
                                    <option value="Men">Men</option>
                                    <option value="Accessories">Accessories</option> 
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <span className="label">Category</span>
                                <select id="p-category" className="input-box" required defaultValue="">
                                    <option value="" disabled>Select Department First</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <span className="label" style={{ color: 'var(--accent)' }}>Placement Visibility</span>
                                <select id="p-placement" className="input-box" required>
                                    <option value="regular">Regular Collection Only</option>
                                    <option value="hero">Homepage Hero (Display on Front Page)</option>
                                </select>
                            </div>
                        </div>
                        
                        <div className="field-grid">
                            <div className="form-group"><span className="label">Colour</span><input type="text" id="p-color" className="input-box" placeholder="e.g. Mustard Yellow" required /></div>
                            <div className="form-group"><span className="label">Fabric</span><input type="text" id="p-fabric" className="input-box" placeholder="e.g. Pure Cotton" required /></div>
                        </div>
                        
                        <div className="form-group" style={{ marginBottom: '30px' }}>
                            <span className="label">Description</span>
                            <textarea id="p-desc" className="input-box" style={{ height: '100px' }} placeholder="Write a compelling description for the product..." required></textarea>
                        </div>
                        
                        <span className="section-subtitle">Seller Information</span>
                        <div className="field-grid">
                            <div className="form-group"><span className="label">Seller Name</span><input type="text" id="s-name" className="input-box" required /></div>
                            <div className="form-group"><span className="label">Brand Name</span><input type="text" id="s-brand" className="input-box" required /></div>
                            <div className="form-group"><span className="label">Phone Number</span><input type="text" inputMode="numeric" id="s-phone" className="input-box" required minLength="10" maxLength="10" /></div>
                            <div className="form-group"><span className="label">Email Address</span><input type="email" id="s-email" className="input-box" required /></div>
                        </div>

                        <div className="field-grid">
                            <div className="form-group"><span className="label">Billing Address</span><input type="text" id="s-address" className="input-box" placeholder="Main office/shop address" required /></div>
                            <div className="form-group"><span className="label">Pickup Address</span><input type="text" id="s-pickup" className="input-box" placeholder="Where courier picks up" required /></div>
                        </div>
                        
                        <div className="field-grid">
                            <div className="form-group"><span className="label">City</span><input type="text" id="s-city" className="input-box" placeholder="e.g. Jorhat" required /></div>
                            
                            <div className="form-group">
                                <span className="label">State / UT</span>
                                <select id="s-state" className="input-box" required defaultValue="">
                                    <option value="" disabled>Select State</option>
                                    <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                                    <option value="Andhra Pradesh">Andhra Pradesh</option>
                                    <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                                    <option value="Assam">Assam</option>
                                    <option value="Bihar">Bihar</option>
                                    <option value="Chandigarh">Chandigarh</option>
                                    <option value="Chhattisgarh">Chhattisgarh</option>
                                    <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                                    <option value="Delhi">Delhi</option>
                                    <option value="Goa">Goa</option>
                                    <option value="Gujarat">Gujarat</option>
                                    <option value="Haryana">Haryana</option>
                                    <option value="Himachal Pradesh">Himachal Pradesh</option>
                                    <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                                    <option value="Jharkhand">Jharkhand</option>
                                    <option value="Karnataka">Karnataka</option>
                                    <option value="Kerala">Kerala</option>
                                    <option value="Ladakh">Ladakh</option>
                                    <option value="Lakshadweep">Lakshadweep</option>
                                    <option value="Madhya Pradesh">Madhya Pradesh</option>
                                    <option value="Maharashtra">Maharashtra</option>
                                    <option value="Manipur">Manipur</option>
                                    <option value="Meghalaya">Meghalaya</option>
                                    <option value="Mizoram">Mizoram</option>
                                    <option value="Nagaland">Nagaland</option>
                                    <option value="Odisha">Odisha</option>
                                    <option value="Puducherry">Puducherry</option>
                                    <option value="Punjab">Punjab</option>
                                    <option value="Rajasthan">Rajasthan</option>
                                    <option value="Sikkim">Sikkim</option>
                                    <option value="Tamil Nadu">Tamil Nadu</option>
                                    <option value="Telangana">Telangana</option>
                                    <option value="Tripura">Tripura</option>
                                    <option value="Uttar Pradesh">Uttar Pradesh</option>
                                    <option value="Uttarakhand">Uttarakhand</option>
                                    <option value="West Bengal">West Bengal</option>
                                </select>
                            </div>

                            <div className="form-group"><span className="label">Pincode</span><input type="text" inputMode="numeric" id="s-pincode" className="input-box" placeholder="e.g. 785001" required minLength="6" maxLength="6" /></div>
                        </div>

                        <div style={{ marginBottom: '30px', background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid var(--input-border)' }}>
                            <span className="label" style={{ display: 'block', marginBottom: '10px', fontWeight: '600', color: 'var(--primary)' }}>
                                Allowed Payment Ways
                            </span>
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                                    <input 
                                        type="checkbox" 
                                        id="p-pay-cod" 
                                        defaultChecked 
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }} 
                                    />
                                    Cash on Delivery (COD)
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                                    <input 
                                        type="checkbox" 
                                        id="p-pay-online" 
                                        defaultChecked 
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }} 
                                    />
                                    Online Payment
                                </label>
                            </div>
                        </div>

                        <div style={{ marginTop: '30px' }}>
                            <span className="section-subtitle">Product Images (Max 5)</span>
                            <label htmlFor="file-upload" className="product-preview upload-label">
                                <div id="upload-prompt-content">
                                    <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '24px', marginBottom: '12px', color: 'var(--text-muted)' }}></i><br />
                                    <span>Click to upload up to 5 high-quality images</span>
                                </div>
                                <div id="image-preview-container" className="preview-grid" style={{ display: 'none' }}></div>
                            </label>
                            
                            <input id="file-upload" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => window.handleFileSelect(e)} />
                        </div>
                        
                        <button type="submit" id="submit-btn" className="btn-submit">Save Product to Database</button> 
                        <button type="button" id="cancel-edit-btn" className="btn-submit" style={{ background: '#ffffff', color: 'var(--text-main)', border: '1px solid var(--input-border)', display: 'none' }} onClick={() => window.cancelEdit()}>Cancel Edit</button> 
                    </form>
                </div>

                <div id="orders" className="content-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Order Processing</span>
                        
                        <div className="search-container">
                            <i className="fa-solid fa-search"></i>
                            <input type="text" id="order-search" placeholder="Search Order ID, Email, Phone..." onInput={(event) => window.handleOrderSearch(event.currentTarget.value)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #f3f4f6', paddingBottom: '16px' }}>
                        <button className="filter-btn active" onClick={(event) => window.filterOrders('all', event.currentTarget)}>All Orders</button>
                        <button className="filter-btn" onClick={(event) => window.filterOrders('pending', event.currentTarget)}>
                            <i className="fa-solid fa-circle-exclamation" style={{ color: 'var(--accent)' }}></i> Needs Verification
                        </button>
                        <button className="filter-btn" onClick={(event) => window.filterOrders('paid', event.currentTarget)}>
                            <i className="fa-solid fa-box" style={{ color: 'var(--success)' }}></i> Ready to Ship
                        </button>
                        <button className="filter-btn" onClick={(event) => window.filterOrders('shipped', event.currentTarget)}>
                            <i className="fa-solid fa-plane" style={{ color: 'var(--primary)' }}></i> Shipped
                        </button>
                    </div>
                    
                    <div id="admin-orders-list">
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading orders data...</p>
                    </div>
                </div>

                <div id="site-settings" className="content-section">
                    <span className="section-title" style={{ marginBottom: '24px' }}>Storefront Management (CMS)</span>
                    
                    <div className="card" style={{ marginBottom: '24px' }}>
                        <span className="section-subtitle">Announcement Banner</span>
                        <p className="text-helper">Update the text shown at the very top of your storefront.</p>
                        <div className="form-group">
                            <input type="text" id="setting-promo-text" className="input-box" placeholder="e.g. Free Shipping on Orders Over ₹2000" />
                        </div>
                        <button type="button" id="update-promo-btn" className="btn-submit" style={{ width: 'auto', padding: '10px 24px', marginTop: '15px' }} onClick={() => window.handlePromoUpdate()}>Update Banner Text</button>
                        <p id="promo-status-msg" style={{ fontWeight: '500', fontSize: '13px', marginTop: '10px' }}></p>
                    </div>

                    <div className="card" style={{ marginBottom: '24px' }}>
                        <span className="section-subtitle">Login Page Branding</span>
                        <p className="text-helper">Paste a high-quality vertical or square image URL to display on the storefront login screen.</p>
                        <div className="form-group">
                            <input 
                                type="text" 
                                id="setting-login-image" 
                                className="input-box" 
                                placeholder="Paste image link here..." 
                                onChange={(e) => window.updateLoginImagePreview(e.target.value)} 
                            />
                        </div>
                        
                        <div id="login-image-preview" style={{ 
                            display: 'none', 
                            width: '100%', 
                            height: '250px', 
                            marginTop: '15px', 
                            backgroundSize: 'cover', 
                            backgroundPosition: 'center', 
                            borderRadius: '8px', 
                            border: '1px solid #e5e7eb' 
                        }}></div>

                        <button type="button" id="update-login-img-btn" className="btn-submit" style={{ width: 'auto', padding: '10px 24px', marginTop: '15px' }} onClick={() => window.handleLoginImageUpdate()}>Update Login Image</button>
                        <p id="login-img-status-msg" style={{ fontWeight: '500', fontSize: '13px', marginTop: '10px' }}></p>
                    </div>

                    <div className="card">
                        <span className="section-subtitle">Homepage Hero Videos</span>
                        <p className="text-helper">Upload your promotional .mp4 videos directly here. Uploading a new video automatically overwrites the old one to optimize storage space.</p>
                        
                        <div className="form-group" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f3f4f6' }}>
                            <span className="label">Women's Collection Video (.mp4)</span>
                            <input type="file" id="setting-women-video-file" className="input-box" accept="video/mp4" style={{ cursor: 'pointer', padding: '6px' }} />
                            <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-muted)' }}>
                                Current Status: <span id="current-women-status" style={{ fontWeight: '500', color: 'var(--primary)' }}>Checking database...</span>
                            </div>
                        </div>
                        
                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <span className="label">Men's Collection Video (.mp4)</span>
                            <input type="file" id="setting-men-video-file" className="input-box" accept="video/mp4" style={{ cursor: 'pointer', padding: '6px' }} />
                            <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-muted)' }}>
                                Current Status: <span id="current-men-status" style={{ fontWeight: '500', color: 'var(--primary)' }}>Checking database...</span>
                            </div>
                        </div>

                        <p id="setting-status-msg" style={{ fontWeight: '500', fontSize: '13px', marginBottom: '16px' }}></p>
                        <button type="button" id="update-settings-btn" className="btn-submit" style={{ width: 'auto', padding: '10px 24px', marginTop: '0' }} onClick={() => window.handleSettingsUpdate()}>Upload & Update Banners</button>
                    </div>
                </div>

                <div id="customer-details" className="content-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Customer Relationship</span>
                        
                        <div className="search-container">
                            <i className="fa-solid fa-search"></i>
                            <input type="text" id="customer-search" placeholder="Search Name, Email, Phone, District..." onInput={(event) => window.handleCustomerSearch(event.currentTarget.value)} />
                        </div>
                    </div>

                    <div id="admin-customers-list">
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading customers from database...</p>
                    </div>
                </div>
            </div>
        </div>
    );
}