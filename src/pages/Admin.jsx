import React, { useEffect, useState } from "react";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, updateDoc, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

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

let globalLiveProducts = [];
let globalOrders = [];
let globalCustomers = [];
let globalSellers = []; 
let editingProductId = null;
let currentEditImageUrls = [];
let selectedFiles = [];        
let activeWomenVideoUrl = "";
let activeMenVideoUrl = "";

export default function Admin() {
    const [activeTab, setActiveTab] = useState("live-products");
    const [selectedSeller, setSelectedSeller] = useState(null);
    const [sellerModalTab, setSellerModalTab] = useState("profile");
    const [sellerPayouts, setSellerPayouts] = useState([]);
    const [globalPendingPayouts, setGlobalPendingPayouts] = useState(0);
    
    const [tribes, setTribes] = useState([]);
    const [activeBanners, setActiveBanners] = useState({}); 

    const [messageTab, setMessageTab] = useState("inbox");
    const [supportTickets, setSupportTickets] = useState([]);
    const [activeTicket, setActiveTicket] = useState(null);

    const [allReviews, setAllReviews] = useState([]);
    const [reviewFilter, setReviewFilter] = useState('all');

    // 🔥 NEW UI STATES
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState(null);
    const [expandedOrders, setExpandedOrders] = useState({});
    const [orderFilterStatus, setOrderFilterStatus] = useState('all');

    const getAuthHeaders = async () => {
        const user = auth.currentUser;
        if (!user) return { 'Content-Type': 'application/json' };
        const token = await user.getIdToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const handleAddTribe = () => setTribes([...tribes, { id: Date.now(), name: '', categories: [], banners: [{ text: '', image: '' }] }]);
    
    const handleAddCategory = (tribeId) => {
        setTribes(tribes.map(t => t.id === tribeId ? { ...t, categories: [...t.categories, { name: '', image: '' }] } : t));
    };

    const handleCategoryNameChange = (tribeId, index, value) => {
        setTribes(tribes.map(t => {
            if (t.id === tribeId) {
                const newCats = [...t.categories];
                newCats[index] = { ...newCats[index], name: value };
                return { ...t, categories: newCats };
            }
            return t;
        }));
    };

    const handleCategoryImgUpload = async (tribeId, catIndex, e) => {
        const file = e.target.files[0];
        if(!file) return;

        window.showToast("Uploading category image...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "jambawear_preset");

        try {
            const res = await fetch("https://api.cloudinary.com/v1_1/dbbafwgug/image/upload", { method: "POST", body: formData });
            const data = await res.json();
            
            if (data.secure_url) {
                setTribes(prevTribes => prevTribes.map(t => {
                    if (t.id === tribeId) {
                        const newCats = [...t.categories];
                        newCats[catIndex] = { ...newCats[catIndex], image: data.secure_url };
                        return { ...t, categories: newCats };
                    }
                    return t;
                }));
                window.showToast("Image uploaded successfully!");
            }
        } catch (error) { alert("Error uploading image: " + error.message); }
    };

    const handleTribeNameChange = (tribeId, value) => setTribes(tribes.map(t => t.id === tribeId ? { ...t, name: value } : t));
    
    const handleRemoveTribe = (tribeId) => {
        if(window.confirm("Are you sure you want to delete this entire Category Group?")) {
            setTribes(tribes.filter(t => t.id !== tribeId));
        }
    };
    
    const handleRemoveCategory = (tribeId, catIndex) => {
        setTribes(tribes.map(t => {
            if (t.id === tribeId) return { ...t, categories: t.categories.filter((_, i) => i !== catIndex) };
            return t;
        }));
    };

    const handleBannerTextChange = (tribeId, index, newText) => {
        setTribes(tribes.map(t => {
            if (t.id === tribeId) {
                const newBanners = [...(t.banners || [])];
                if (!newBanners[index]) newBanners[index] = { text: '', image: '' };
                newBanners[index] = { ...newBanners[index], text: newText };
                return { ...t, banners: newBanners };
            }
            return t;
        }));
    };

    const handleBannerImageUpload = async (tribeId, index, e) => {
        const file = e.target.files[0];
        if(!file) return;

        window.showToast("Uploading banner image...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "jambawear_preset");

        try {
            const res = await fetch("https://api.cloudinary.com/v1_1/dbbafwgug/image/upload", { method: "POST", body: formData });
            const data = await res.json();
            
            if (data.secure_url) {
                setTribes(prevTribes => prevTribes.map(t => {
                    if (t.id === tribeId) {
                        const newBanners = [...(t.banners || [])];
                        if (!newBanners[index]) newBanners[index] = { text: '', image: '' };
                        newBanners[index] = { ...newBanners[index], image: data.secure_url };
                        return { ...t, banners: newBanners };
                    }
                    return t;
                }));
                window.showToast("Banner image uploaded successfully!");
            }
        } catch (error) { alert("Error uploading banner image: " + error.message); }
    };

    const addBannerSlide = (tribeId) => {
        setTribes(tribes.map(t => {
            if(t.id === tribeId) {
                const newBanners = [...(t.banners || []), { text: '', image: '' }];
                setActiveBanners(prev => ({...prev, [tribeId]: newBanners.length - 1}));
                return { ...t, banners: newBanners };
            }
            return t;
        }));
    };

    const removeBannerSlide = (tribeId, index) => {
        setTribes(tribes.map(t => {
            if(t.id === tribeId) {
                let newBanners = [...(t.banners || [])];
                newBanners.splice(index, 1);
                if(newBanners.length === 0) newBanners = [{text: '', image: ''}];
                setActiveBanners(prev => ({...prev, [tribeId]: Math.max(0, index - 1)}));
                return { ...t, banners: newBanners };
            }
            return t;
        }));
    };

    const handleSaveTribes = async () => {
        const btn = document.getElementById('save-tribes-btn');
        btn.disabled = true;
        btn.innerText = "Saving...";

        const cleanedTribes = tribes.map(t => ({
            ...t,
            categories: t.categories.filter(c => c.name && c.name.trim() !== ''),
            banners: (t.banners || []).filter(b => b.text.trim() !== '' || b.image !== '')
        })).filter(t => t.name.trim() !== '' || t.categories.length > 0 || (t.banners && t.banners.length > 0));

        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE_URL}/admin/settings/tribe_categories`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({ tribes: cleanedTribes })
            });
            if(!res.ok) throw new Error("Failed to save category settings");
            setTribes(cleanedTribes);
            window.showToast("Category & Banner Settings Saved Securely!");
        } catch (error) {
            alert("Error saving settings: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Save Changes";
        }
    };

    useEffect(() => {
        window.showSection = function(sectionId) {
            setActiveTab(sectionId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if(sectionId === 'messages') loadSupportTickets();
        };

        window.showToast = function(message) {
            const toast = document.getElementById('toast-notification');
            if(toast) {
                toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
                toast.classList.add('show');
                setTimeout(() => { toast.classList.remove('show'); }, 3000);
            }
        };

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
                errorMsg.innerText = "Login failed: " + error.message;
                errorMsg.style.display = 'block';
            }
        };

        window.handleLogout = async () => {
            await signOut(auth);
            window.location.reload(); 
        };
         
        async function bootstrapData() {
            loadSiteSettings();
            window.loadTribes();
            window.loadGlobalPayouts(); 
            window.loadAuthorizedSellers(); 
            setTimeout(() => {
                loadAdminInventory(); 
                loadAdminOrders(); 
                loadCustomerDetails();
                loadAdminReviews(); 
            }, 500);
        }

        async function loadSupportTickets() {
            try {
                const q = query(collection(db, "support_tickets"));
                const querySnapshot = await getDocs(q);
                let tickets = [];
                querySnapshot.forEach((doc) => {
                    tickets.push({ id: doc.id, ...doc.data() });
                });
                
                tickets.sort((a, b) => new Date(b.date) - new Date(a.date));
                setSupportTickets(tickets);
            } catch (error) { console.error("Error loading tickets:", error); }
        }

        async function loadAdminReviews() {
            try {
                const q = query(collection(db, "reviews"));
                const querySnapshot = await getDocs(q);
                let loadedReviews = [];
                querySnapshot.forEach((doc) => {
                    loadedReviews.push({ id: doc.id, ...doc.data() });
                });
                
                loadedReviews.sort((a, b) => {
                    const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return dateB - dateA;
                });
                
                setAllReviews(loadedReviews);
            } catch (error) {
                console.error("Error loading reviews:", error);
            }
        }

        window.deleteReview = async function(reviewId) {
            if(confirm("Are you sure you want to delete this review? This cannot be undone.")) {
                try {
                    await deleteDoc(doc(db, "reviews", reviewId));
                    window.showToast("Review deleted successfully.");
                    loadAdminReviews(); 
                } catch(e) {
                    alert("Error deleting review: " + e.message);
                }
            }
        };

        window.loadTribes = async function() {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`${API_BASE_URL}/admin/settings/tribe_categories`, { headers });
                const data = await res.json();
                if (data.tribes) {
                    const mappedTribes = data.tribes.map(t => ({
                        ...t,
                        categories: t.categories ? t.categories.map(c => typeof c === 'string' ? { name: c, image: '' } : c) : [],
                        banners: (t.banners && t.banners.length > 0) ? t.banners : [{ text: '', image: '' }] 
                    }));
                    setTribes(mappedTribes);
                } else {
                    setTribes([{ id: 1, name: 'CATEGORIES', categories: [], banners: [{ text: '', image: '' }] }]);
                }
            } catch (error) { console.error("Error loading tribes:", error); }
        };

        window.loadGlobalPayouts = async function() {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`${API_BASE_URL}/admin/payouts?status=pending`, { headers });
                const data = await res.json();
                setGlobalPendingPayouts(data.length || 0);
            } catch(e) { console.error("Error loading global payouts:", e); }
        };

        window.loadAuthorizedSellers = async function() {
            const list = document.getElementById('authorized-sellers-list');
            if(!list) return;

            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`${API_BASE_URL}/admin/sellers`, { headers });
                const sellersData = await res.json();
                
                if(sellersData.length === 0) {
                    list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No sellers currently authorized.</p>';
                    return;
                }
                
                globalSellers = [];
                let htmlString = '';
                
                for (const seller of sellersData) {
                    const email = seller.email;
                    const dateAdded = seller.addedAt ? new Date(seller.addedAt).toLocaleDateString() : 'Unknown Date';
                    
                    const profRes = await fetch(`${API_BASE_URL}/admin/seller_profiles/${email}`, { headers });
                    const profileData = await profRes.json();
                    
                    const brandName = profileData?.brandName || "Profile Not Setup";
                    const sellerName = profileData?.sellerName || "Unknown Owner";
                    
                    globalSellers.push({ email, addedAt: dateAdded, profile: profileData });

                    htmlString += `
                        <div class="card" style="padding: 20px; display:flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                            <div style="display: flex; gap: 16px; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justifyContent: center; font-size: 20px; font-weight: bold; overflow: hidden;">
                                    ${profileData?.profilePhoto ? `<img src="${profileData.profilePhoto}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" />` : brandName.charAt(0)}
                                </div>
                                <div>
                                    <strong style="color: var(--primary); font-size: 16px;">${brandName}</strong><br>
                                    <span style="font-size: 13px; color: var(--text-main);"><i class="fa-solid fa-user" style="color: var(--text-muted);"></i> ${sellerName} &nbsp;|&nbsp; <i class="fa-solid fa-envelope" style="color: var(--text-muted);"></i> ${email}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button type="button" class="action-btn btn-status-active" onclick="window.openSellerDetails('${email}')">
                                    <i class="fa-solid fa-folder-open"></i> Manage Store
                                </button>
                                <button type="button" class="action-btn btn-delete" onclick="window.removeAuthorizedSeller('${email}')">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }
                
                list.innerHTML = htmlString;
            } catch (e) {
                list.innerHTML = `<p style="color: var(--danger); font-size: 13px;">Error loading sellers. Check API connection.</p>`;
            }
        };

        window.openSellerDetails = async function(email) {
            const seller = globalSellers.find(s => s.email === email);
            if(!seller) return;
            
            const myProducts = globalLiveProducts.filter(p => p.sellerEmail === seller.email || p.brandName === seller.profile?.brandName);
            
            const myOrders = globalOrders.filter(o => {
                if(!o.items) return false;
                return o.items.some(orderItem => {
                    const matchesStamp = (orderItem.sellerEmail && orderItem.sellerEmail === seller.email) || 
                                         (orderItem.brandName && seller.profile?.brandName && orderItem.brandName === seller.profile?.brandName);
                    const matchesLiveProduct = myProducts.some(myProduct => myProduct.docId === orderItem.id || myProduct.item_id === orderItem.item_id || myProduct.title === orderItem.title);
                    return matchesStamp || matchesLiveProduct;
                });
            });

            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE_URL}/admin/payouts?email=${email}`, { headers });
            const payouts = await res.json();

            seller.products = myProducts;
            seller.orders = myOrders;
            setSellerPayouts(payouts);
            setSelectedSeller(seller);
            setSellerModalTab("profile");
            
            document.body.style.overflow = "hidden";
        };

        window.closeSellerModal = function() {
            setSelectedSeller(null);
            document.body.style.overflow = "auto";
        };

        window.addAuthorizedSeller = async function(e) {
            e.preventDefault();
            const emailInput = document.getElementById('new-seller-email');
            const email = emailInput.value.trim().toLowerCase();
            const btn = document.getElementById('add-seller-btn');
            if(!email) return;

            btn.disabled = true;
            btn.innerText = "Authorizing...";

            try {
                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/sellers`, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({ email: email })
                });
                window.showToast(email + " has been authorized!");
                emailInput.value = "";
                window.loadAuthorizedSellers();
            } catch(err) {
                alert("Error authorizing seller: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Authorize Seller";
            }
        };

        window.removeAuthorizedSeller = async function(email) {
            if(confirm(`Are you absolutely sure you want to revoke access for ${email}?`)) {
                try {
                    const headers = await getAuthHeaders();
                    await fetch(`${API_BASE_URL}/admin/sellers/${email}`, { method: "DELETE", headers: headers });
                    window.showToast("Access revoked for " + email);
                    window.loadAuthorizedSellers();
                } catch(e) {
                    alert("Error removing seller: " + e.message);
                }
            }
        };

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
                            <img src="${url}" alt="Preview" loading="lazy" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--input-border);">
                            <button type="button" onclick="window.removeEditImage(${index})" style="position:absolute; top:-8px; right:-8px; background:var(--danger); color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:12px; cursor:pointer; display:flex; align-items:center; justifyContent:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                });

                selectedFiles.forEach((file, index) => {
                    const objectUrl = URL.createObjectURL(file);
                    html += `
                        <div style="position:relative; display:inline-block; margin: 4px;">
                            <img src="${objectUrl}" alt="Preview" loading="lazy" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid var(--success);">
                            <button type="button" onclick="window.removeNewImage(${index})" style="position:absolute; top:-8px; right:-8px; background:var(--danger); color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:12px; cursor:pointer; display:flex; align-items:center; justifyContent:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fa-solid fa-xmark"></i></button>
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
                    isOutOfStock: false,
                    approval_status: "approved"
                };

                const method = editingProductId ? "PUT" : "POST";
                const endpoint = editingProductId ? `${API_BASE_URL}/admin/products/${editingProductId}` : `${API_BASE_URL}/admin/products`;

                const headers = await getAuthHeaders();
                const response = await fetch(endpoint, {
                    method: method,
                    headers: headers,
                    body: JSON.stringify(productData)
                });

                if (!response.ok) throw new Error("Failed to save product on server.");

                window.showToast(editingProductId ? "Product Updated Successfully!" : "New Product Added Successfully!");

                document.getElementById('new-product-form').reset();
                document.getElementById('p-pay-cod').checked = true; 
                document.getElementById('p-pay-online').checked = true; 
                
                editingProductId = null;
                currentEditImageUrls = [];
                selectedFiles = [];
                window.renderImagePreview();

                window.showSection('live-products');
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
            window.showSection('live-products');
        };

        window.approveProduct = async function(productId) {
            if(confirm("Approve this product and make it live on the store?")) {
                try {
                    const headers = await getAuthHeaders();
                    await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                        method: "PUT",
                        headers: headers,
                        body: JSON.stringify({ approval_status: 'approved', isHidden: false })
                    });
                    window.showToast("Product Approved & Published!");
                    loadAdminInventory();
                } catch (e) {
                    alert("Error approving product: " + e.message);
                }
            }
        };

        window.rejectProduct = async function(productId) {
            if(confirm("Reject this product? The seller will be notified in their dashboard.")) {
                try {
                    const headers = await getAuthHeaders();
                    await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                        method: "PUT",
                        headers: headers,
                        body: JSON.stringify({ approval_status: 'rejected', isHidden: true })
                    });
                    window.showToast("Product Rejected.");
                    loadAdminInventory();
                } catch (e) {
                    alert("Error rejecting product: " + e.message);
                }
            }
        };

        window.toggleProductHide = async function(productId, newState) {
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({ isHidden: newState })
            });
            loadAdminInventory();
        };

        window.toggleProductStock = async function(productId, newState) {
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({ isOutOfStock: newState })
            });
            loadAdminInventory();
        };

        window.deleteProduct = async function(productId) {
            if(confirm("Are you sure you want to completely delete this product?")) {
                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/products/${productId}`, { 
                    method: "DELETE",
                    headers: headers 
                });
                loadAdminInventory();
            }
        };

        window.editProduct = function(productId) {
            const product = globalLiveProducts.find(p => p.docId === productId);
            if (!product) {
                alert("Error: Product data not found.");
                return;
            }

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
            window.showSection('add-product');
        };

        async function loadSiteSettings() {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`${API_BASE_URL}/admin/settings/hero_banners`, { headers });
                const data = await res.json();
                
                if (data && Object.keys(data).length > 0) {
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
                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/settings/hero_banners`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({
                        login_image_url: newUrl,
                        last_updated: new Date().toISOString()
                    })
                });
                window.showToast("Login Image updated securely!");
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
                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/settings/hero_banners`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({
                        promo_text: newText,
                        last_updated: new Date().toISOString()
                    })
                });
                window.showToast("Banner text updated securely!");
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

                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/settings/hero_banners`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({
                        women_video: finalWomenUrl,
                        men_video: finalMenUrl,
                        last_updated: new Date().toISOString()
                    })
                });

                window.showToast("Videos uploaded securely!");
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

        async function loadAdminInventory() {
            try {
                const headers = await getAuthHeaders();
                const response = await fetch(`${API_BASE_URL}/admin/products?limit=50`, {
                    method: 'GET',
                    headers: headers
                });
                
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
            
            if(productsToRender.length === 0) {
                inventoryList.innerHTML = '<p style="padding: 20px; color: var(--text-muted); font-weight: 500;">No matching products found.</p>';
                return;
            }

            let htmlString = '';

            productsToRender.forEach((product) => {
                let mainImgUrl = (product.images && product.images.length > 0) ? product.images[0] : "https://via.placeholder.com/150";
                
                if (mainImgUrl.includes('res.cloudinary.com') && mainImgUrl.includes('/upload/')) {
                    mainImgUrl = mainImgUrl.replace('/upload/', '/upload/w_150,c_fill,q_auto/');
                }
                
                const placementText = product.placement === 'hero' ? '<span class="hero-badge"><i class="fa-solid fa-star"></i> Hero</span>' : '';
                const isHidden = product.isHidden || false;
                const isOOS = product.isOutOfStock || false;

                let approvalBadge = '';
                if (product.approval_status === 'pending') {
                    approvalBadge = '<span class="hero-badge" style="background-color: var(--accent);"><i class="fa-solid fa-clock"></i> Pending Approval</span>';
                } else if (product.approval_status === 'rejected') {
                    approvalBadge = '<span class="hero-badge" style="background-color: var(--danger);"><i class="fa-solid fa-xmark"></i> Rejected</span>';
                } else {
                    approvalBadge = '<span class="hero-badge" style="background-color: var(--success);"><i class="fa-solid fa-check-double"></i> Approved</span>';
                }

                const hiddenBadge = isHidden ? '<span class="hero-badge" style="background-color: #9CA3AF;"><i class="fa-solid fa-eye-slash"></i> Hidden</span>' : '';
                const oosBadge = isOOS ? '<span class="hero-badge" style="background-color: var(--danger);"><i class="fa-solid fa-ban"></i> Out Of Stock</span>' : '';
                
                let actionButtonsHtml = '';
                if (product.approval_status === 'pending') {
                    actionButtonsHtml = `
                        <button type="button" class="action-btn" style="background: var(--success); color: white;" onclick="window.approveProduct('${product.docId}')"><i class="fa-solid fa-check"></i> Approve & Publish</button>
                        <button type="button" class="action-btn" style="background: var(--danger); color: white;" onclick="window.rejectProduct('${product.docId}')"><i class="fa-solid fa-xmark"></i> Reject</button>
                        <div style="flex-grow: 1;"></div>
                        <button type="button" class="action-btn btn-edit" onclick="window.editProduct('${product.docId}')"><i class="fa-solid fa-pen"></i> Review Details</button>
                    `;
                } else {
                    const hideBtnText = isHidden ? '<i class="fa-solid fa-eye-slash"></i> Hidden' : '<i class="fa-solid fa-eye"></i> Visible';
                    const hideBtnClass = isHidden ? 'btn-status-hidden' : 'btn-status-active';
                    const stockBtnText = isOOS ? '<i class="fa-solid fa-ban"></i> Out of Stock' : '<i class="fa-solid fa-box"></i> In Stock';
                    const stockBtnClass = isOOS ? 'btn-status-inactive' : 'btn-status-active';

                    actionButtonsHtml = `
                        <button type="button" class="action-btn btn-edit" onclick="window.editProduct('${product.docId}')"><i class="fa-solid fa-pen"></i> Edit Details</button>
                        <div style="width: 1px; height: 16px; background: #e5e7eb; margin: 0 4px;"></div>
                        <button type="button" class="action-btn ${hideBtnClass}" onclick="window.toggleProductHide('${product.docId}', ${!isHidden})">${hideBtnText}</button>
                        <button type="button" class="action-btn ${stockBtnClass}" onclick="window.toggleProductStock('${product.docId}', ${!isOOS})">${stockBtnText}</button>
                        <div style="flex-grow: 1;"></div>
                        <button type="button" class="action-btn btn-delete" onclick="window.deleteProduct('${product.docId}')"><i class="fa-solid fa-trash"></i></button>
                    `;
                }

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

                htmlString += `
                <div class="card" style="display: flex; gap: 24px; padding: 24px; border: ${product.approval_status === 'pending' ? '2px solid var(--accent)' : '1px solid #e5e7eb'}">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 2px;">
                            ID: ${product.item_id || product.docId} ${placementText} ${approvalBadge} ${hiddenBadge} ${oosBadge}
                        </div>
                        <div style="font-size: 11px; color: #9CA3AF; margin-bottom: 8px;">
                            <i class="fa-regular fa-clock"></i> Uploaded: ${dateStr} | By: ${product.sellerEmail || 'Admin'}
                        </div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--primary); margin-bottom: 4px;">${product.title}</div>
                        <div style="font-size: 14px; color: var(--text-main); margin-bottom: 16px;">
                            <span style="font-weight: 600;">₹${product.selling_price}</span> &nbsp;<span style="color:#d1d5db;">|</span>&nbsp; ${displayCategory}
                        </div>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding-top: 16px; border-top: 1px solid #f3f4f6;">
                            ${actionButtonsHtml}
                        </div>
                    </div>
                    <img src="${mainImgUrl}" loading="lazy" style="width:110px; height:110px; object-fit:cover; border-radius:8px; border: 1px solid #e5e7eb;">
                </div>`;
            });
            
            inventoryList.innerHTML = htmlString; 
        }

        window.filterInventory = function(type, btn) {
            const subFilterRow = document.getElementById('regular-sub-filters');
            document.querySelectorAll('.filter-group .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (type === 'all') {
                subFilterRow.style.display = 'none';
                renderInventoryList(globalLiveProducts);
            } else if (type === 'pending') {
                subFilterRow.style.display = 'none';
                renderInventoryList(globalLiveProducts.filter(p => p.approval_status === 'pending'));
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

        async function loadAdminOrders() {
            try {
                const headers = await getAuthHeaders();
                const response = await fetch(`${API_BASE_URL}/admin/orders?limit=50`, {
                    method: 'GET',
                    headers: headers
                });

                if (!response.ok) throw new Error("Failed to load orders.");
                
                const data = await response.json();
                globalOrders = data;
                globalOrders.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
                
                // Initialize react state for admin orders mapping
                window.renderReactOrders(globalOrders);

            } catch (error) {
                console.error("Error loading orders:", error);
                document.getElementById('admin-orders-list').innerHTML = `<p style="padding: 20px; color: var(--danger); font-weight: bold;">Failed to load orders.</p>`;
            }
        }

        window.updateOrderStatus = async function(orderId, newStatus) {
            if(confirm(`Are you sure you want to mark this order as ${newStatus.toUpperCase()}?`)) {
                try {
                    const headers = await getAuthHeaders();
                    await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                        method: "PUT",
                        headers: headers,
                        body: JSON.stringify({ status: newStatus })
                    });
                    loadAdminOrders();
                    window.showToast("Order Status Updated");
                } catch(e) {
                    alert("Error updating order: " + e.message);
                }
            }
        };

        window.verifyManualPayment = async function(orderId, isCOD) {
            let paymentId = isCOD ? 'COD' : document.getElementById(`manual-pay-id-${orderId}`).value.trim();
            
            if (!isCOD && !paymentId) {
                alert("Please enter the Razorpay Payment ID to verify this online order.");
                return;
            }

            if(confirm("Are you sure you want to verify this payment and mark the order as PAID?")) {
                try {
                    const headers = await getAuthHeaders();
                    await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                        method: "PUT",
                        headers: headers,
                        body: JSON.stringify({ status: 'paid', payment_id: paymentId })
                    });
                    loadAdminOrders();
                    window.showToast("Payment Verified successfully!");
                } catch(e) {
                    alert("Error verifying payment: " + e.message);
                }
            }
        };

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
                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({ trackingId: trackingId, courierName: courierName })
                });
                window.showToast("Tracking Info Saved Successfully!");
                loadAdminOrders();
            } catch(e) {
                alert("Error saving tracking info: " + e.message);
            } finally {
                btn.innerText = "Save Tracking";
                btn.disabled = false;
            }
        };

        window.handleLabelUpload = async function(orderId) {
            const fileInput = document.getElementById(`pdf-file-${orderId}`);
            if (!fileInput) return;
            const file = fileInput.files[0];
            
            if (!file) {
                alert("Please select a PDF file from your device first.");
                return;
            }

            const uploadBtn = document.getElementById(`upload-pdf-btn-${orderId}`);
            const originalText = uploadBtn ? uploadBtn.innerHTML : "Upload Label";
            if (uploadBtn) {
                uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
                uploadBtn.disabled = true;
            }

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("upload_preset", "jambawear_preset");

                const res = await fetch("https://api.cloudinary.com/v1_1/dbbafwgug/auto/upload", { 
                    method: "POST", 
                    body: formData 
                });
                const data = await res.json();

                if (!data.secure_url) {
                    throw new Error(data.error?.message || "Cloudinary upload failed.");
                }

                const headers = await getAuthHeaders();
                await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({ shipping_label_url: data.secure_url })
                });

                window.showToast("Shipping label securely uploaded to Cloudinary!");
                loadAdminOrders(); 
            } catch (err) {
                alert("Label upload failed: " + err.message);
            } finally {
                if (uploadBtn) {
                    uploadBtn.innerHTML = originalText;
                    uploadBtn.disabled = false;
                }
                if (fileInput) fileInput.value = ""; 
            }
        };

        window.copyAddress = function(name, phone, add1, landmark, district, state, pin) {
            const formattedAddress = `${name}\nPhone: ${phone}\n${add1}\n${landmark ? landmark + '\n' : ''}${district}, ${state} - ${pin}`;
            navigator.clipboard.writeText(formattedAddress).then(() => {
                window.showToast("Shipping address copied!");
            }).catch(err => {
                console.error("Failed to copy text: ", err);
            });
        };

        async function loadCustomerDetails() {
            try {
                const headers = await getAuthHeaders();
                const response = await fetch(`${API_BASE_URL}/admin/customers?limit=50`, {
                    method: 'GET',
                    headers: headers
                });
                
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
            
            if(customersToRender.length === 0) {
                customerList.innerHTML = '<p style="padding: 20px; color: var(--text-muted); font-weight: 500;">No customers found matching your search.</p>';
                return;
            }

            let htmlString = '';

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

                htmlString += `
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
            
            customerList.innerHTML = htmlString; 
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

        const handleClickOutside = (event) => {
            if (!event.target.closest('.header-profile-container')) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);

    }, []);

    // 🔥 REACT STATE INTEGRATION FOR ADMIN ORDERS
    const [reactOrders, setReactOrders] = useState([]);
    useEffect(() => {
        window.renderReactOrders = (orders) => {
            setReactOrders(orders);
        };
    }, []);

    const handleAdminSaveSellerProfile = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('admin-save-prof-btn');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const updatedProfile = {
                ...selectedSeller.profile,
                brandName: document.getElementById('admin-edit-brand').value,
                sellerName: document.getElementById('admin-edit-name').value,
                primaryPhone: document.getElementById('admin-edit-phone').value,
                storeEmail: document.getElementById('admin-edit-email').value,
                accName: document.getElementById('admin-edit-accname').value,
                accNumber: document.getElementById('admin-edit-accnum').value,
                ifsc: document.getElementById('admin-edit-ifsc').value,
            };

            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/admin/seller_profiles/${selectedSeller.email}`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify(updatedProfile)
            });
            
            setSelectedSeller(prev => ({...prev, profile: updatedProfile}));
            window.showToast("Seller Profile Updated Securely!");
            window.loadAuthorizedSellers(); 
        } catch (err) {
            alert("Error updating profile: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Changes';
        }
    };

    const handleMarkPayoutPaid = async (payoutId) => {
        const utr = prompt("Enter Bank Transfer UTR/Reference Number:");
        if(!utr) return;

        try {
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({
                    status: 'paid',
                    utr: utr,
                    paid_at: new Date().toISOString()
                })
            });
            
            setSellerPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: 'paid', utr: utr } : p));
            window.showToast("Payout Marked as Paid Securely!");
            window.loadGlobalPayouts();
        } catch(e) {
            alert("Error updating payout: " + e.message);
        }
    };

    const handleSendBroadcast = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('broadcast-btn');
        btn.disabled = true;
        btn.innerText = "Sending...";

        const targetEmail = document.getElementById('broadcast-target').value;
        const subject = document.getElementById('broadcast-subject').value;
        const message = document.getElementById('broadcast-message').value;

        try {
            const newTicketData = {
                sellerName: targetEmail === 'all' ? 'All Sellers' : globalSellers.find(s => s.email === targetEmail)?.profile?.brandName || targetEmail,
                email: targetEmail,
                subject: subject,
                status: 'open',
                date: new Date().toISOString(),
                messages: [{ sender: 'admin', text: message, time: new Date().toISOString() }]
            };
            
            const docRef = await addDoc(collection(db, "support_tickets"), newTicketData);
            setSupportTickets([{ id: docRef.id, ...newTicketData }, ...supportTickets]);
            window.showToast("Message Sent Successfully!");
            document.getElementById('broadcast-form').reset();
            setMessageTab('inbox');
        } catch (error) {
            alert("Error sending message: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Send Message";
        }
    };

    const handleReplyTicket = async (e) => {
        e.preventDefault();
        const replyText = document.getElementById('ticket-reply-text').value;
        if (!replyText.trim()) return;

        try {
            const updatedMessages = [...activeTicket.messages, { sender: 'admin', text: replyText, time: new Date().toISOString() }];
            const ticketRef = doc(db, "support_tickets", activeTicket.id);
            await updateDoc(ticketRef, { messages: updatedMessages, status: 'open' });
            const updatedTicket = { ...activeTicket, messages: updatedMessages, status: 'open' };
            
            setActiveTicket(updatedTicket);
            setSupportTickets(supportTickets.map(t => t.id === updatedTicket.id ? updatedTicket : t));
            document.getElementById('ticket-reply-text').value = '';
            
        } catch(error) {
            console.error(error);
            alert("Error replying to ticket: " + error.message);
        }
    };

    const markTicketResolved = async () => {
        try {
            const ticketRef = doc(db, "support_tickets", activeTicket.id);
            await updateDoc(ticketRef, { status: 'resolved' });
            const updatedTicket = { ...activeTicket, status: 'resolved' };
            setActiveTicket(updatedTicket);
            setSupportTickets(supportTickets.map(t => t.id === updatedTicket.id ? updatedTicket : t));
            window.showToast("Ticket marked as resolved.");
        } catch(error) {
            alert("Error resolving ticket: " + error.message);
        }
    };

    // 🔥 FILTRATION LOGIC FOR ORDERS
    const filteredAdminOrders = reactOrders.filter(order => {
        // Text Search
        const searchLower = (document.getElementById('order-search')?.value || "").toLowerCase();
        const jambaId = (order.jamba_order_id || "").toLowerCase();
        const orderId = (order.razorpay_order_id || order.id || "").toLowerCase();
        const contactInfo = (order.email || order.customerContact || "").toLowerCase();
        let addressString = "";
        if (order.shippingAddress) {
            addressString = `${order.shippingAddress.name} ${order.shippingAddress.phone} ${order.shippingAddress.district} ${order.shippingAddress.state}`.toLowerCase();
        }
        
        const matchesSearch = jambaId.includes(searchLower) || orderId.includes(searchLower) || contactInfo.includes(searchLower) || addressString.includes(searchLower);

        // Status Filter
        let matchesStatus = true;
        const currentStatus = order.status ? order.status.toLowerCase() : 'pending';
        if (orderFilterStatus !== 'all') {
            if (orderFilterStatus === 'pending') matchesStatus = (currentStatus === 'pending' || currentStatus === 'created');
            else if (orderFilterStatus === 'paid') matchesStatus = (currentStatus === 'paid' || currentStatus === 'processing');
            else if (orderFilterStatus === 'shipped') matchesStatus = (currentStatus === 'shipped' || currentStatus === 'out_for_delivery' || currentStatus === 'delivered');
            else matchesStatus = (currentStatus === orderFilterStatus);
        }

        return matchesSearch && matchesStatus;
    });

    return (
        <div className="admin-isolated-wrapper">
            <div id="toast-notification" className="toast-notification"></div>

            <div id="login-overlay">
                <div className="login-box" style={{ textAlign: 'center' }}>
                    <h2><span style={{ color: 'var(--accent)' }}>JAMBA</span>WEAR Admin</h2>
                    <p>Please log in with your authorized Google account.</p>
                    <div className="login-error" id="login-error" style={{ display: 'none', marginBottom: '15px' }}>Unauthorized email address.</div>
                    
                    <button type="button" className="btn-submit" onClick={() => window.handleAdminLogin()} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <i className="fa-brands fa-google"></i> Sign In With Google
                    </button>
                </div>
            </div>

            {/* 🔥 NEW UNIFIED HEADER 🔥 */}
            <header className="admin-top-header">
                <div className="logo-block">
                    <div className="logo-jamba">JAMBA</div>
                    <div className="logo-sub">ADMIN DASHBOARD</div>
                </div>

                <div className="header-profile-container">
                    <div className="header-profile-trigger" onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}>
                        <div className="header-avatar-placeholder">A</div>
                        <div className="header-brand-details">
                            <span className="header-brand-label">System Admin</span>
                            <span className="header-brand-name">Master Control</span>
                        </div>
                        <i className={`fa-solid fa-chevron-${isProfileMenuOpen ? 'up' : 'down'} header-chevron`}></i>
                    </div>

                    {isProfileMenuOpen && (
                        <div className="header-profile-dropdown">
                            <div className="dropdown-menu-item text-danger" onClick={() => window.handleLogout()}>
                                <i className="fa-solid fa-arrow-right-from-bracket"></i> Secure Logout
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* 🔥 NEW TAB BAR 🔥 */}
            <nav className="admin-tab-bar">
                <ul className="nav-menu">
                    <li className={`nav-item ${activeTab === 'live-products' ? 'active' : ''}`} onClick={() => window.showSection('live-products')}><i className="fa-solid fa-layer-group"></i> Inventory</li>
                    <li className={`nav-item ${activeTab === 'add-product' ? 'active' : ''}`} onClick={() => window.showSection('add-product')}><i className="fa-solid fa-plus"></i> Add Product</li>
                    <li className={`nav-item ${activeTab === 'tribe-settings' ? 'active' : ''}`} onClick={() => window.showSection('tribe-settings')}><i className="fa-solid fa-sitemap"></i> Categories</li>
                    <li className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => window.showSection('orders')}><i className="fa-solid fa-truck"></i> Orders</li>
                    <li className={`nav-item ${activeTab === 'seller-access' ? 'active' : ''}`} onClick={() => window.showSection('seller-access')}>
                        <i className="fa-solid fa-store"></i> Sellers
                        {globalPendingPayouts > 0 && <span className="sidebar-badge">{globalPendingPayouts}</span>}
                    </li>
                    <li className={`nav-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => window.showSection('messages')}>
                        <i className="fa-solid fa-envelope"></i> Inbox
                        {supportTickets.filter(t => t.status === 'open').length > 0 && <span className="sidebar-badge">{supportTickets.filter(t => t.status === 'open').length}</span>}
                    </li>
                    <li className={`nav-item ${activeTab === 'site-settings' ? 'active' : ''}`} onClick={() => window.showSection('site-settings')}><i className="fa-solid fa-sliders"></i> Site Setup</li>
                    <li className={`nav-item ${activeTab === 'customer-details' ? 'active' : ''}`} onClick={() => window.showSection('customer-details')}><i className="fa-solid fa-user-group"></i> Customers</li>
                    <li className={`nav-item ${activeTab === 'store-reviews' ? 'active' : ''}`} onClick={() => window.showSection('store-reviews')}><i className="fa-solid fa-star"></i> Reviews</li>
                </ul>
            </nav>

            <div className="main-pannel">

                {/* INVENTORY TAB */}
                <div id="live-products" className={`content-section ${activeTab === 'live-products' ? 'active' : ''}`}>
                    <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--input-border)', paddingBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="section-title">Current Inventory</span>
                            <div className="filter-group">
                                <button type="button" className="filter-btn active" onClick={(event) => window.filterInventory('all', event.currentTarget)}>All</button>
                                <button type="button" className="filter-btn" onClick={(event) => window.filterInventory('pending', event.currentTarget)} style={{color: 'var(--accent)'}}>⚠️ Needs Approval</button>
                                <button type="button" className="filter-btn" onClick={(event) => window.filterInventory('hero', event.currentTarget)}>Homepage Hero</button>
                                <button type="button" className="filter-btn" onClick={(event) => window.filterInventory('regular', event.currentTarget)}>Regular Collection</button>
                            </div>
                        </div>

                        <div id="regular-sub-filters" style={{ display: 'none', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #e5e7eb' }}>
                            <span className="label" style={{ alignSelf: 'center', marginRight: '8px' }}>Filter Regular:</span>
                            <button type="button" className="filter-btn active" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('all', event.currentTarget)}>All Categories</button>
                            <button type="button" className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Men', event.currentTarget)}>Men Only</button>
                            <button type="button" className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Women', event.currentTarget)}>Women Only</button>
                            <button type="button" className="filter-btn" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={(event) => window.filterByGender('Accessories', event.currentTarget)}>Accessories Only</button>
                        </div>
                    </div>
                    <div id="admin-inventory-list">
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading inventory from database...</p>
                    </div>
                </div>

                {/* ADD PRODUCT TAB */}
                <div id="add-product" className={`content-section ${activeTab === 'add-product' ? 'active' : ''}`}>
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

                {/* CATEGORY SETTING TAB */}
                <div id="tribe-settings" className={`content-section ${activeTab === 'tribe-settings' ? 'active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Category Setting</span>
                        <button id="save-tribes-btn" className="btn-submit" style={{ width: 'auto', marginTop: 0, padding: '10px 24px' }} onClick={handleSaveTribes}>
                            Save Changes
                        </button>
                    </div>

                    {tribes.map((tribe) => {
                        const currentIdx = activeBanners[tribe.id] || 0;
                        const banners = (tribe.banners && tribe.banners.length > 0) ? tribe.banners : [{ text: '', image: '' }];
                        const currentBanner = banners[currentIdx] || { text: '', image: '' };

                        return (
                            <div key={tribe.id} style={{ marginBottom: '40px' }}>
                                
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        style={{ fontSize: '24px', fontWeight: '500', textTransform: 'uppercase', border: 'none', background: 'transparent', color: '#111', outline: 'none', width: '100%', letterSpacing: '0.02em' }}
                                        value={`${tribe.name}`}
                                        onChange={(e) => handleTribeNameChange(tribe.id, e.target.value)}
                                        placeholder="e.g. MEN CATEGORIES"
                                    />
                                    <button type="button" className="action-btn btn-delete" onClick={() => handleRemoveTribe(tribe.id)} title="Delete Category Group"><i className="fa-solid fa-trash"></i></button>
                                </div>

                                <div style={{ backgroundColor: '#a7d7b5', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', display: 'flex', gap: '20px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                                    {tribe.categories.map((cat, cIndex) => (
                                        <div key={cIndex} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: '0 0 auto', position: 'relative' }}>
                                            <button type="button" onClick={() => handleRemoveCategory(tribe.id, cIndex)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-xmark" style={{fontSize: '10px'}}></i>
                                            </button>

                                            <label 
                                                style={{ 
                                                    width: '110px', height: '110px', 
                                                    backgroundColor: cat.image ? '#fff' : '#e5e7eb', 
                                                    border: '1px solid #9ca3af', borderRadius: '12px', 
                                                    padding: cat.image ? '0' : '8px', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                    textAlign: 'center', cursor: 'pointer', transition: '0.2s', overflow: 'hidden' 
                                                }} 
                                                onMouseOver={(e) => e.currentTarget.style.borderColor = '#111'} 
                                                onMouseOut={(e) => e.currentTarget.style.borderColor = '#9ca3af'} 
                                                title="Click to upload category image"
                                            >
                                                {cat.image ? (
                                                    <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: '10px', color: '#6b7280', lineHeight: '1.2', fontWeight: '600', textTransform: 'uppercase' }}>
                                                        <i className="fa-solid fa-cloud-arrow-up" style={{fontSize: '18px', marginBottom: '4px'}}></i><br/>Upload<br/>Image
                                                    </span>
                                                )}
                                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleCategoryImgUpload(tribe.id, cIndex, e)} />
                                            </label>

                                            <input
                                                type="text"
                                                style={{ width: '100px', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '14px', fontWeight: '500', color: '#111', outline: 'none', borderBottom: '1px dashed transparent', transition: '0.2s' }}
                                                onFocus={(e) => e.target.style.borderBottomColor = '#111'}
                                                onBlur={(e) => e.target.style.borderBottomColor = 'transparent'}
                                                value={cat.name}
                                                onChange={(e) => handleCategoryNameChange(tribe.id, cIndex, e.target.value)}
                                                placeholder="Name"
                                            />
                                        </div>
                                    ))}
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
                                        <div onClick={() => handleAddCategory(tribe.id)} style={{ width: '110px', height: '110px', backgroundColor: '#a7d7b5', border: '1.5px solid #111', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#9bcba9'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#a7d7b5'}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-plus" style={{ fontSize: '20px', color: '#111' }}></i>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>Type</span>
                                    </div>
                                </div>

                                <div style={{ 
                                    backgroundColor: currentBanner.image ? 'transparent' : '#a7d7b5', 
                                    backgroundImage: currentBanner.image ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${currentBanner.image})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    borderRadius: '16px', 
                                    padding: '40px 60px', 
                                    position: 'relative', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    textAlign: 'center', 
                                    minHeight: '220px',
                                    transition: '0.3s'
                                }}>
                                    <div style={{ position: 'absolute', top: '16px', right: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <span style={{color: currentBanner.image ? '#fff' : '#111', fontSize: '12px', fontWeight: 'bold', marginRight: '8px'}}>Slide {currentIdx + 1}/{banners.length}</span>
                                        
                                        <i className="fa-solid fa-plus" style={{ fontSize: '20px', cursor: 'pointer', color: currentBanner.image ? '#fff' : '#111' }} title="Add New Slide" onClick={() => addBannerSlide(tribe.id)}></i>
                                        
                                        <label style={{ cursor: 'pointer', margin: 0, display: 'flex' }} title="Upload Banner Image">
                                            <i className="fa-solid fa-images" style={{ fontSize: '20px', color: currentBanner.image ? '#fff' : '#111' }}></i>
                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleBannerImageUpload(tribe.id, currentIdx, e)} />
                                        </label>
                                        
                                        <i className="fa-solid fa-trash-can" style={{ fontSize: '20px', cursor: 'pointer', color: currentBanner.image ? '#ff4d4d' : '#dc2626' }} title="Delete Slide" onClick={() => removeBannerSlide(tribe.id, currentIdx)}></i>
                                    </div>

                                    <i className="fa-solid fa-chevron-left" 
                                       onClick={() => setActiveBanners(prev => ({...prev, [tribe.id]: currentIdx === 0 ? banners.length - 1 : currentIdx - 1}))}
                                       style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', fontSize: '40px', cursor: 'pointer', color: currentBanner.image ? '#fff' : '#111' }}></i>
                                    
                                    <textarea 
                                        style={{ 
                                            width: '80%', background: 'transparent', border: '1px dashed transparent', 
                                            fontSize: '14px', fontWeight: '600', color: currentBanner.image ? '#fff' : '#111', 
                                            textAlign: 'center', resize: 'none', minHeight: '80px', textTransform: 'uppercase', 
                                            outline: 'none', lineHeight: '1.6', transition: '0.2s' 
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = currentBanner.image ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'}
                                        onBlur={(e) => e.target.style.borderColor = 'transparent'}
                                        placeholder="Type your banner announcement here..."
                                        value={currentBanner.text}
                                        onChange={(e) => handleBannerTextChange(tribe.id, currentIdx, e.target.value)}
                                    ></textarea>

                                    <i className="fa-solid fa-chevron-right" 
                                       onClick={() => setActiveBanners(prev => ({...prev, [tribe.id]: currentIdx === banners.length - 1 ? 0 : currentIdx + 1}))}
                                       style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', fontSize: '40px', cursor: 'pointer', color: currentBanner.image ? '#fff' : '#111' }}></i>

                                    <div style={{ position: 'absolute', bottom: '20px', display: 'flex', gap: '8px', background: currentBanner.image ? 'rgba(0,0,0,0.5)' : '#e5e7eb', padding: '6px 12px', borderRadius: '20px', border: currentBanner.image ? '1px solid rgba(255,255,255,0.2)' : '1px solid #111' }}>
                                        {banners.map((_, i) => (
                                            <span 
                                                key={i} 
                                                onClick={() => setActiveBanners(prev => ({...prev, [tribe.id]: i}))}
                                                style={{ 
                                                    width: '12px', height: '12px', borderRadius: '50%', 
                                                    background: i === currentIdx ? (currentBanner.image ? '#fff' : '#111') : 'transparent', 
                                                    border: currentBanner.image ? '1px solid #fff' : '1px solid #111', 
                                                    cursor: 'pointer' 
                                                }}>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                    
                    <div style={{ textAlign: 'center', marginTop: '20px' }}>
                        <button type="button" className="action-btn" style={{ background: 'var(--bg-light)', border: '1px solid var(--input-border)', padding: '10px 24px', fontWeight: '600', fontSize: '14px' }} onClick={handleAddTribe}>
                            + Add New Category Group
                        </button>
                    </div>
                </div>

                {/* ORDERS TAB */}
                <div id="orders" className={`content-section ${activeTab === 'orders' ? 'active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Order Processing</span>
                    </div>

                    <div className="orders-controls-bar">
                        <div className="search-container" style={{ flex: '1', minWidth: '250px' }}>
                            <i className="fa-solid fa-search"></i>
                            <input 
                                type="text" 
                                id="order-search" 
                                placeholder="Search Order ID, Email, Phone..." 
                                onInput={(e) => {
                                    document.getElementById('order-search').value = e.currentTarget.value;
                                    setReactOrders([...globalOrders]); // trigger re-render
                                }} 
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #f3f4f6', paddingBottom: '16px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        <button type="button" className={`filter-btn ${orderFilterStatus === 'all' ? 'active' : ''}`} onClick={() => setOrderFilterStatus('all')}>All Orders</button>
                        <button type="button" className={`filter-btn ${orderFilterStatus === 'pending' ? 'active' : ''}`} onClick={() => setOrderFilterStatus('pending')}>
                            <i className="fa-solid fa-circle-exclamation" style={{ color: orderFilterStatus === 'pending' ? 'white' : 'var(--accent)' }}></i> Needs Verification
                        </button>
                        <button type="button" className={`filter-btn ${orderFilterStatus === 'paid' ? 'active' : ''}`} onClick={() => setOrderFilterStatus('paid')}>
                            <i className="fa-solid fa-box" style={{ color: orderFilterStatus === 'paid' ? 'white' : 'var(--success)' }}></i> Ready to Ship
                        </button>
                        <button type="button" className={`filter-btn ${orderFilterStatus === 'shipped' ? 'active' : ''}`} onClick={() => setOrderFilterStatus('shipped')}>
                            <i className="fa-solid fa-plane" style={{ color: orderFilterStatus === 'shipped' ? 'white' : 'var(--primary)' }}></i> Shipped
                        </button>
                    </div>
                    
                    <div id="admin-orders-list">
                        {filteredAdminOrders.length === 0 ? (
                            <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>No orders found matching your search.</p>
                        ) : (
                            filteredAdminOrders.map(order => {
                                const currentStatus = order.status ? order.status.toLowerCase() : 'pending';
                                const pMethod = order.payment_method || order.paymentMethod;
                                const isCOD = pMethod && pMethod.toUpperCase() === 'COD';
                                
                                let statusClass = "status-pending";
                                let statusLabel = "PENDING";
                                if (currentStatus === 'paid') { statusClass = "status-paid"; statusLabel = "PAID"; }
                                else if (currentStatus === 'processing') { statusClass = "status-processing"; statusLabel = "PROCESSING"; }
                                else if (currentStatus === 'shipped') { statusClass = "status-shipped"; statusLabel = "SHIPPED"; }
                                else if (currentStatus === 'out_for_delivery') { statusClass = "status-ofd"; statusLabel = "OUT FOR DELIVERY"; }
                                else if (currentStatus === 'delivered') { statusClass = "status-delivered"; statusLabel = "DELIVERED"; }
                                else if (currentStatus === 'cancelled') { statusClass = "status-cancelled"; statusLabel = "CANCELLED"; }

                                const sellerAcceptedBadge = order.seller_accepted 
                                    ? `<span style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-store"></i> SELLER ACCEPTED</span>`
                                    : `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-clock"></i> WAITING FOR SELLER</span>`;

                                const customerName = order.shippingAddress?.name || 'Guest Customer';
                                const customerPhone = order.shippingAddress?.phone || order.customerContact || 'No phone provided';
                                const addressString = order.shippingAddress 
                                    ? `${order.shippingAddress.address1}${order.shippingAddress.landmark ? `, ${order.shippingAddress.landmark}` : ''}, ${order.shippingAddress.district}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}` 
                                    : 'No shipping address provided by customer';

                                let sellerName = 'N/A', brandName = 'N/A', sellerPhone = 'N/A', pickupAddress = 'N/A', locationStr = '';
                                if (order.items && order.items.length > 0) {
                                    const firstItem = order.items[0];
                                    const liveProduct = globalLiveProducts.find(p => p.docId === firstItem.id || p.item_id === firstItem.item_id || p.title === firstItem.title);
                                    const source = liveProduct || firstItem; 
                                    
                                    sellerName = source.sellerName || 'N/A';
                                    brandName = source.brandName || 'N/A';
                                    sellerPhone = source.sellerPhone || 'N/A';
                                    pickupAddress = source.pickupAddress || 'N/A';
                                    locationStr = source.city ? `${source.city}, ${source.state} - ${source.pincode}` : '';
                                }

                                const existingCourier = order.courierName || '';
                                const existingTracking = order.trackingId || '';
                                const existingLabel = order.shipping_label_url || order.shippingLabel || '';

                                return (
                                    <div key={order.id} className="moc-card">
                                        <div className="moc-header">
                                            <div className="moc-header-left">
                                                <div className="moc-ref">Order Ref: <strong>{order.jamba_order_id || order.id}</strong></div>
                                                <div className="moc-date" dangerouslySetInnerHTML={{__html: sellerAcceptedBadge}}></div>
                                            </div>
                                            <div className="moc-header-right" style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px'}}>
                                                <div className="moc-date">{new Date(order.created_at || order.createdAt).toLocaleString([], {day:'numeric', month:'short', year:'numeric'})}</div>
                                                {isCOD ? <span className="moc-payment-badge cod">COD</span> : <span className="moc-payment-badge prepaid">PREPAID</span>}
                                            </div>
                                        </div>

                                        <div className="moc-body">
                                            <div className="moc-items-header">
                                                <span className="moc-items-title"><i className="fa-solid fa-box-open" style={{color: '#4b5563', marginRight: '6px'}}></i> Items</span>
                                                <span className={`moc-status-badge ${statusClass}`}>{statusLabel}</span>
                                            </div>

                                            {order.items && order.items.map((item, idx) => (
                                                <div key={idx} className="moc-item-row">
                                                    <img src={item.image || 'https://via.placeholder.com/150'} alt={item.title} className="moc-item-img" style={{width:'50px', height:'60px'}} />
                                                    <div className="moc-item-details">
                                                        <div className="moc-item-title" style={{fontSize:'13px'}}>{item.title}</div>
                                                        <div className="moc-item-meta">Qty: {item.quantity || 1} | Size: {item.size || 'N/A'}</div>
                                                    </div>
                                                    <div className="moc-item-earnings">
                                                        <div className="moc-earning-amount" style={{fontSize:'14px'}}>₹{((item.price || item.selling_price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</div>
                                                    </div>
                                                </div>
                                            ))}

                                            {expandedOrders[order.id] && (
                                                <div className="fade-in">
                                                    <div className="moc-customer-section" style={{background:'#fef2f2', border:'1px solid #fecaca'}}>
                                                        <div className="moc-customer-title" style={{color:'#991b1b'}}><i className="fa-solid fa-location-dot"></i> Delivery Address</div>
                                                        <div className="moc-customer-name" style={{color:'#7f1d1d'}}>{customerName}</div>
                                                        <div className="moc-customer-address">{addressString}</div>
                                                        <div className="moc-customer-phone"><i className="fa-solid fa-phone"></i> {customerPhone}</div>
                                                    </div>

                                                    <div className="moc-customer-section" style={{background:'#f8fafc', border:'1px solid #e2e8f0'}}>
                                                        <div className="moc-customer-title"><i className="fa-solid fa-store"></i> Seller Details</div>
                                                        <div className="moc-customer-name">{brandName} ({sellerName})</div>
                                                        <div className="moc-customer-address">{pickupAddress}<br/>{locationStr}</div>
                                                        <div className="moc-customer-phone"><i className="fa-solid fa-phone"></i> {sellerPhone}</div>
                                                    </div>

                                                    {/* Admin Actions */}
                                                    <div style={{marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                                                        {(currentStatus === 'pending' || currentStatus === 'created') && (
                                                            <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
                                                                {!isCOD && <input type="text" id={`manual-pay-id-${order.id}`} placeholder="Payment ID" className="input-box" style={{maxWidth:'140px', minHeight:'38px'}} />}
                                                                <button type="button" className="action-btn" style={{background:'var(--success)', color:'white', border:'none'}} onClick={() => window.verifyManualPayment(order.id, isCOD)}>Verify Payment</button>
                                                                <button type="button" className="action-btn" style={{background:'var(--danger)', color:'white', border:'none'}} onClick={() => window.updateOrderStatus(order.id, 'cancelled')}>Reject</button>
                                                            </div>
                                                        )}
                                                        {currentStatus === 'paid' && <button type="button" className="btn-submit" onClick={() => window.updateOrderStatus(order.id, 'processing')}>Mark Processing</button>}
                                                        {currentStatus === 'processing' && <button type="button" className="btn-submit" onClick={() => window.updateOrderStatus(order.id, 'shipped')}>Mark Shipped</button>}
                                                        {currentStatus === 'shipped' && <button type="button" className="btn-submit" onClick={() => window.updateOrderStatus(order.id, 'out_for_delivery')}>Mark Out for Delivery</button>}
                                                        {currentStatus === 'out_for_delivery' && <button type="button" className="btn-submit" style={{background:'var(--success)'}} onClick={() => window.updateOrderStatus(order.id, 'delivered')}>Mark Delivered</button>}
                                                    </div>

                                                    <div style={{marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                                                        <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                                                            <input type="text" id={`courier-name-${order.id}`} defaultValue={existingCourier} placeholder="Courier Name" className="input-box" style={{flex:1, minWidth:'120px'}} />
                                                            <input type="text" id={`tracking-id-${order.id}`} defaultValue={existingTracking} placeholder="Tracking ID" className="input-box" style={{flex:1, minWidth:'120px'}} />
                                                            <button type="button" id={`track-btn-${order.id}`} className="action-btn" style={{background:'var(--primary)', color:'white', border:'none'}} onClick={() => window.updateTrackingInfo(order.id)}>Save Tracking</button>
                                                        </div>
                                                        
                                                        <div style={{marginTop:'12px', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
                                                            {existingLabel && <a href={existingLabel} target="_blank" rel="noopener noreferrer" className="action-btn" style={{background:'#ecfdf5', color:'#065f46', borderColor:'#a7f3d0'}}><i className="fa-solid fa-file-pdf"></i> View Label</a>}
                                                            <input type="file" id={`pdf-file-${order.id}`} accept=".pdf" style={{fontSize:'12px', maxWidth:'180px'}} />
                                                            <button type="button" id={`upload-pdf-btn-${order.id}`} className="action-btn" onClick={() => window.handleLabelUpload(order.id)}>Upload Label PDF</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="moc-expand-trigger" onClick={() => setExpandedOrders(prev => ({...prev, [order.id]: !prev[order.id]}))}>
                                            {expandedOrders[order.id] ? <>HIDE ADMIN DETAILS <i className="fa-solid fa-chevron-up"></i></> : <>VIEW ADMIN DETAILS <i className="fa-solid fa-chevron-down"></i></>}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* SELLER DIRECTORY TAB */}
                <div id="seller-access" className={`content-section ${activeTab === 'seller-access' ? 'active' : ''}`}>
                    <span className="section-title" style={{ marginBottom: '24px' }}>Seller Directory</span>
                    <p className="text-helper" style={{ marginBottom: '20px' }}>Only Google Emails added to this list will be allowed to log into the JAMBAWEAR Seller Portal.</p>

                    <form className="card" style={{ marginBottom: '24px' }} onSubmit={(e) => window.addAuthorizedSeller(e)}>
                        <span className="section-subtitle">Authorize New Partner</span>
                        <div className="field-grid" style={{ alignItems: 'end' }}>
                            <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                <span className="label">Partner's Google Email</span>
                                <input type="email" id="new-seller-email" className="input-box" placeholder="e.g. bodo.weavers@gmail.com" required />
                            </div>
                            <button type="submit" id="add-seller-btn" className="btn-submit" style={{ width: 'auto', padding: '10px 24px', margin: 0 }}>Authorize Partner</button>
                        </div>
                    </form>

                    <span className="section-subtitle">Currently Authorized Sellers</span>
                    <div id="authorized-sellers-list" style={{ marginTop: '16px' }}>
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading authorized sellers...</p>
                    </div>
                </div>

                {/* MESSAGES / SUPPORT COMMUNICATIONS TAB */}
                <div id="messages" className={`content-section ${activeTab === 'messages' ? 'active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Communications Hub</span>
                        <div className="filter-group">
                            <button type="button" className={`filter-btn ${messageTab === 'inbox' ? 'active' : ''}`} onClick={() => { setMessageTab('inbox'); setActiveTicket(null); }}>
                                Inbox 
                                {supportTickets.filter(t => t.status === 'open').length > 0 && <span style={{background:'var(--danger)', color:'white', padding:'2px 6px', borderRadius:'10px', fontSize:'10px', marginLeft:'4px'}}>{supportTickets.filter(t => t.status === 'open').length}</span>}
                            </button>
                            <button type="button" className={`filter-btn ${messageTab === 'broadcast' ? 'active' : ''}`} onClick={() => setMessageTab('broadcast')}>
                                <i className="fa-solid fa-paper-plane"></i> Send Broadcast
                            </button>
                        </div>
                    </div>

                    {messageTab === 'inbox' && !activeTicket && (
                        <div className="card">
                            <span className="section-subtitle">Support Tickets & Queries</span>
                            {supportTickets.length === 0 ? (
                                <p style={{color: 'var(--text-muted)'}}>No active messages from sellers.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {supportTickets.map(ticket => (
                                        <div key={ticket.id} className="ticket-card" onClick={() => setActiveTicket(ticket)}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                <strong style={{ color: 'var(--primary)', fontSize: '15px' }}>{ticket.subject}</strong>
                                                <span className={`ticket-status ${ticket.status}`}>{ticket.status === 'open' ? 'Needs Reply' : 'Resolved'}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '8px' }}>
                                                From: <strong>{ticket.sellerName}</strong> ({ticket.email})
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {new Date(ticket.date).toLocaleString()} | ID: {ticket.id}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {messageTab === 'inbox' && activeTicket && (
                        <div className="card chat-view-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
                                <div>
                                    <button type="button" onClick={() => setActiveTicket(null)} className="action-btn" style={{marginBottom: '10px', fontSize:'12px', padding:'4px 8px'}}><i className="fa-solid fa-arrow-left"></i> Back to Inbox</button>
                                    <h3 style={{ margin: 0, color: 'var(--primary)' }}>{activeTicket.subject}</h3>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{activeTicket.sellerName} ({activeTicket.email})</span>
                                </div>
                                {activeTicket.status === 'open' && (
                                    <button type="button" onClick={markTicketResolved} className="action-btn btn-status-active">
                                        <i className="fa-solid fa-check"></i> Mark Resolved
                                    </button>
                                )}
                            </div>

                            <div className="chat-history-container">
                                {activeTicket.messages.map((msg, idx) => (
                                    <div key={idx} className={`chat-bubble-wrapper ${msg.sender === 'admin' ? 'admin-bubble' : 'seller-bubble'}`}>
                                        <div className="chat-bubble">
                                            {msg.text}
                                        </div>
                                        <span className="chat-time">{new Date(msg.time).toLocaleString([], {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'short'})}</span>
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={handleReplyTicket} style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                <input type="text" id="ticket-reply-text" className="input-box" placeholder="Type your reply here..." required style={{flex: 1}} />
                                <button type="submit" className="btn-submit" style={{width: 'auto', margin: 0, padding: '10px 24px'}}>Reply</button>
                            </form>
                        </div>
                    )}

                    {messageTab === 'broadcast' && (
                        <form className="card" id="broadcast-form" onSubmit={handleSendBroadcast}>
                            <span className="section-subtitle">Send a Direct Message or Broadcast</span>
                            <p className="text-helper">Send an important update to all sellers or select a specific seller to communicate directly.</p>
                            
                            <div className="field-grid">
                                <div className="form-group">
                                    <span className="label">To</span>
                                    <select id="broadcast-target" className="input-box" required>
                                        <option value="all">📣 ALL SELLERS (Broadcast)</option>
                                        {globalSellers.map(s => (
                                            <option key={s.email} value={s.email}>{s.profile?.brandName || s.email}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <span className="label">Subject</span>
                                    <input type="text" id="broadcast-subject" className="input-box" placeholder="e.g. Action Required: Holiday Shipping Delay" required />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <span className="label">Message</span>
                                <textarea id="broadcast-message" className="input-box" style={{height: '150px'}} placeholder="Write your message here..." required></textarea>
                            </div>

                            <button type="submit" id="broadcast-btn" className="btn-submit">Send Message</button>
                        </form>
                    )}
                </div>

                {/* SITE SETTINGS TAB */}
                <div id="site-settings" className={`content-section ${activeTab === 'site-settings' ? 'active' : ''}`}>
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

                {/* CUSTOMERS TAB */}
                <div id="customer-details" className={`content-section ${activeTab === 'customer-details' ? 'active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Customer Relationship</span>
                        
                        <div className="search-container">
                            <i className="fa-solid fa-search"></i>
                            <input type="text" id="customer-search" placeholder="Search Name, Email, Phone..." onInput={(event) => window.handleCustomerSearch(event.currentTarget.value)} />
                        </div>
                    </div>

                    <div id="admin-customers-list">
                        <p style={{ padding: '20px', fontWeight: '500', color: 'var(--text-muted)' }}>Loading customers from database...</p>
                    </div>
                </div>

                {/* 🔥 STORE REVIEWS TAB WITH LIGHTBOX 🔥 */}
                <div id="store-reviews" className={`content-section ${activeTab === 'store-reviews' ? 'active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <span className="section-title">Reputation Management</span>
                        <div className="filter-group">
                            <button type="button" className={`filter-btn ${reviewFilter === 'all' ? 'active' : ''}`} onClick={() => setReviewFilter('all')}>All Reviews</button>
                            <button type="button" className={`filter-btn ${reviewFilter === 'positive' ? 'active' : ''}`} onClick={() => setReviewFilter('positive')}>Positive (4-5 ★)</button>
                            <button type="button" className={`filter-btn ${reviewFilter === 'negative' ? 'active' : ''}`} onClick={() => setReviewFilter('negative')} style={reviewFilter === 'negative' ? {color:'var(--danger)', borderColor:'var(--danger)'} : {}}>Critical (1-3 ★)</button>
                        </div>
                    </div>

                    <div className="admin-reviews-grid">
                        {allReviews.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No reviews have been published yet.</p>
                        ) : (
                            allReviews.filter(rev => {
                                if (reviewFilter === 'positive') return rev.rating >= 4;
                                if (reviewFilter === 'negative') return rev.rating < 4;
                                return true;
                            }).map((rev) => {
                                const relatedProduct = globalLiveProducts.find(p => p.id === rev.productId || p.item_id === rev.productId || p.docId === rev.productId);
                                const productImg = relatedProduct?.images?.[0] || 'https://via.placeholder.com/80';
                                const productTitle = relatedProduct?.title || 'Unknown Product';

                                return (
                                    <div key={rev.id} className="card review-admin-card">
                                        <div className="review-admin-header">
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <img src={productImg} alt="product" className="review-product-thumb" />
                                                <div>
                                                    <div className="r-prod-title">{productTitle}</div>
                                                    <div className="r-user-info">{rev.userName} • {new Date(rev.createdAt?.toDate ? rev.createdAt.toDate() : rev.createdAt).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                            <div className={`rev-star-badge rating-${rev.rating}`}>
                                                {rev.rating} ★
                                            </div>
                                        </div>

                                        <div className="review-admin-body">
                                            "{rev.reviewText || 'No text provided.'}"
                                        </div>

                                        {/* 🔥 CLICKABLE IMAGES 🔥 */}
                                        {rev.images && rev.images.length > 0 && (
                                            <div className="review-admin-images">
                                                {rev.images.map((img, i) => (
                                                    <img 
                                                        key={i} 
                                                        src={img} 
                                                        alt="customer upload" 
                                                        onClick={() => setFullscreenImage(img)}
                                                        style={{ cursor: 'pointer', transition: 'transform 0.2s ease', border: '1px solid #e5e7eb' }}
                                                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        <div className="review-admin-footer">
                                            <button className="action-btn btn-delete" onClick={() => window.deleteReview(rev.id)}>
                                                <i className="fa-solid fa-trash"></i> Delete Review
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 🔥 FULLSCREEN IMAGE MODAL 🔥 */}
                {fullscreenImage && (
                    <div className="image-lightbox-overlay" onClick={() => setFullscreenImage(null)}>
                        <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
                            <button className="image-lightbox-close" onClick={() => setFullscreenImage(null)}>✕</button>
                            <img src={fullscreenImage} alt="Fullscreen Review" />
                        </div>
                    </div>
                )}

            </div>

            {/* SELLER MODAL OVERLAY */}
            {selectedSeller && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-content">
                        
                        <div className="admin-modal-header">
                            <h2>
                                {selectedSeller.profile?.profilePhoto ? <img src={selectedSeller.profile?.profilePhoto} style={{width: 40, height: 40, borderRadius: '50%', objectFit: 'cover'}} /> : null}
                                {selectedSeller.profile?.brandName || selectedSeller.email}
                            </h2>
                            <button type="button" className="btn-close-modal" onClick={() => window.closeSellerModal()}>Close Panel</button>
                        </div>

                        <div className="admin-modal-tabs">
                            <button type="button" className={`admin-modal-tab ${sellerModalTab === 'profile' ? 'active' : ''}`} onClick={() => setSellerModalTab('profile')}>Store Profile</button>
                            <button type="button" className={`admin-modal-tab ${sellerModalTab === 'catalog' ? 'active' : ''}`} onClick={() => setSellerModalTab('catalog')}>Catalog & Stock ({selectedSeller.products.length})</button>
                            <button type="button" className={`admin-modal-tab ${sellerModalTab === 'orders' ? 'active' : ''}`} onClick={() => setSellerModalTab('orders')}>Orders ({selectedSeller.orders.length})</button>
                            <button type="button" className={`admin-modal-tab ${sellerModalTab === 'finance' ? 'active' : ''}`} onClick={() => setSellerModalTab('finance')}>
                                Financials & Payouts
                                {sellerPayouts.filter(p => p.status === 'pending').length > 0 && (
                                    <span className="tab-badge">{sellerPayouts.filter(p => p.status === 'pending').length}</span>
                                )}
                            </button>
                        </div>

                        <div className="admin-modal-body">
                            
                            {/* TAB 1: EDIT PROFILE */}
                            {sellerModalTab === 'profile' && (
                                <form onSubmit={handleAdminSaveSellerProfile}>
                                    <div className="field-grid">
                                        <div className="form-group"><span className="label">Brand Name</span><input type="text" id="admin-edit-brand" defaultValue={selectedSeller.profile?.brandName} className="input-box" required /></div>
                                        <div className="form-group"><span className="label">Owner Name</span><input type="text" id="admin-edit-name" defaultValue={selectedSeller.profile?.sellerName} className="input-box" required /></div>
                                    </div>
                                    <div className="field-grid">
                                        <div className="form-group"><span className="label">Contact Email</span><input type="email" id="admin-edit-email" defaultValue={selectedSeller.profile?.storeEmail || selectedSeller.email} className="input-box" required /></div>
                                        <div className="form-group"><span className="label">Contact Phone</span><input type="text" id="admin-edit-phone" defaultValue={selectedSeller.profile?.primaryPhone} className="input-box" required /></div>
                                    </div>
                                    
                                    <span className="section-subtitle" style={{marginTop: '20px'}}>Bank Details</span>
                                    <div className="field-grid">
                                        <div className="form-group"><span className="label">Account Name</span><input type="text" id="admin-edit-accname" defaultValue={selectedSeller.profile?.accName} className="input-box" required /></div>
                                        <div className="form-group"><span className="label">Account Number</span><input type="text" id="admin-edit-accnum" defaultValue={selectedSeller.profile?.accNumber} className="input-box" required /></div>
                                        <div className="form-group"><span className="label">IFSC Code</span><input type="text" id="admin-edit-ifsc" defaultValue={selectedSeller.profile?.ifsc} className="input-box" required /></div>
                                    </div>

                                    <button type="submit" id="admin-save-prof-btn" className="btn-submit" style={{width: 'auto', padding: '10px 24px'}}>Save Changes</button>
                                </form>
                            )}

                            {/* TAB 2: CATALOG */}
                            {sellerModalTab === 'catalog' && (
                                <div>
                                    {selectedSeller.products.length === 0 ? <p style={{color: 'var(--text-muted)'}}>No products uploaded by this seller.</p> : null}
                                    {selectedSeller.products.map(p => (
                                        <div key={p.docId || p.id} style={{ display: 'flex', gap: '16px', padding: '16px', borderBottom: '1px solid #eee' }}>
                                            <img src={p.images?.[0] || 'https://via.placeholder.com/80'} loading="lazy" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '6px' }} />
                                            <div>
                                                <strong style={{fontSize: '15px', color: 'var(--primary)'}}>{p.title}</strong>
                                                <div style={{fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px'}}>
                                                    Price: ₹{p.selling_price} | Stock: <strong>{p.stock || 0}</strong> | Status: {p.approval_status === 'pending' ? '⚠️ Pending' : '✅ Live'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* TAB 3: ORDERS */}
                            {sellerModalTab === 'orders' && (
                                <div>
                                    {selectedSeller.orders.length === 0 ? <p style={{color: 'var(--text-muted)'}}>No orders to fulfill yet.</p> : null}
                                    {selectedSeller.orders.map(o => (
                                        <div key={o.id} style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
                                            <strong style={{color: 'var(--primary)'}}>Order Ref: {o.id}</strong>
                                            <div style={{fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px'}}>
                                                Status: <span style={{textTransform: 'uppercase', color: 'var(--primary)'}}>{o.status || 'Pending'}</span> | 
                                                Seller Accepted: {o.seller_accepted ? '✅ Yes' : '⏳ Waiting'}
                                            </div>
                                            {o.trackingId && <div style={{fontSize: '12px', marginTop: '6px', background: '#f9fafb', padding: '8px'}}>Tracking: {o.trackingId} ({o.courierName})</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* TAB 4: FINANCIALS */}
                            {sellerModalTab === 'finance' && (
                                <div>
                                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                                        <div style={{flex: 1, background: '#fef3c7', padding: '16px', borderRadius: '8px', color: '#b45309'}}>
                                            <div style={{fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase'}}>Pending Payout Requests</div>
                                            <div style={{fontSize: '24px', fontWeight: 'bold'}}>{sellerPayouts.filter(p => p.status === 'pending').length}</div>
                                        </div>
                                        <div style={{flex: 1, background: '#ecfdf5', padding: '16px', borderRadius: '8px', color: '#065f46'}}>
                                            <div style={{fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase'}}>Total Paid Payouts</div>
                                            <div style={{fontSize: '24px', fontWeight: 'bold'}}>{sellerPayouts.filter(p => p.status === 'paid').length}</div>
                                        </div>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #e5e7eb', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '12px 8px' }}>Date</th>
                                                <th style={{ padding: '12px 8px' }}>Amount</th>
                                                <th style={{ padding: '12px 8px' }}>Status</th>
                                                <th style={{ padding: '12px 8px' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sellerPayouts.map(p => (
                                                <tr key={p.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                                                    <td style={{ padding: '12px 8px' }}>{new Date(p.date).toLocaleDateString()}</td>
                                                    <td style={{ padding: '12px 8px', fontWeight: 'bold', color: 'var(--primary)' }}>₹{p.amount}</td>
                                                    <td style={{ padding: '12px 8px' }}>
                                                        {p.status === 'paid' ? <span style={{color: 'var(--success)'}}>Paid ({p.utr})</span> : <span style={{color: 'var(--accent)'}}>Pending</span>}
                                                    </td>
                                                    <td style={{ padding: '12px 8px' }}>
                                                        {p.status === 'pending' && (
                                                            <button type="button" onClick={() => handleMarkPayoutPaid(p.id)} style={{background: 'var(--primary)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer'}}>Mark Paid</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {sellerPayouts.length === 0 && <tr><td colSpan="4" style={{padding: '16px 8px', color: 'var(--text-muted)'}}>No payout requests found.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}