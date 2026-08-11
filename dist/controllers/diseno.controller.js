"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyProducts = exports.deleteProduct = exports.partialUpdateProduct = exports.updateProduct = exports.createProduct = exports.getAllProducts = void 0;
const product_service_1 = require("../services/product.service");
const getAllProducts = async (req, res, next) => {
    try {
        const pagination = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 12,
        };
        const result = await product_service_1.productService.getAll(pagination);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.getAllProducts = getAllProducts;
const createProduct = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.body.disenadorId;
        if (!userId) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        const product = await product_service_1.productService.create(req.body, userId);
        res.status(201).json({
            message: 'Producto creado exitosamente',
            data: product,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        const product = await product_service_1.productService.update(id, req.body, userId);
        res.status(200).json({
            message: 'Producto actualizado exitosamente',
            data: product,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateProduct = updateProduct;
const partialUpdateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        const product = await product_service_1.productService.partialUpdate(id, req.body, userId);
        res.status(200).json({
            message: 'Producto modificado exitosamente',
            data: product,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.partialUpdateProduct = partialUpdateProduct;
const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        await product_service_1.productService.delete(id, userId);
        res.status(200).json({ message: 'Producto eliminado exitosamente' });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteProduct = deleteProduct;
const getMyProducts = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        const products = await product_service_1.productService.getByDesigner(userId);
        res.status(200).json(products);
    }
    catch (error) {
        next(error);
    }
};
exports.getMyProducts = getMyProducts;
