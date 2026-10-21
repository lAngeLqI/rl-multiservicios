// src/controllers/authController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

// ========== REGISTRO ==========
export const register = async (req: Request, res: Response) => {
    try {
        const { nombre, email, password, rol, telefono, empresa } = req.body;

        // 1. Verificar si el usuario ya existe (Postgres usa $1)
        const existing = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }

        // 2. Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insertar usuario y obtener el ID generado (RETURNING)
        const result = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, rol, telefono, empresa, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, 'pendiente') RETURNING id`,
            [nombre, email, hashedPassword, rol || 'disenador', telefono, empresa]
        );

        const userId = result.rows[0].id;

        // 4. Generar token
        const token = jwt.sign(
            { id: userId, email, rol: rol || 'disenador' },
            process.env['JWT_SECRET'] || 'secret',
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                token,
                user: {
                    id: userId,
                    nombre,
                    email,
                    rol: rol || 'disenador'
                }
            }
        });

    } catch (error) {
        console.error('Error en register:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al registrar usuario'
        });
    }
};

// ========== LOGIN ==========
export const login = async (req: Request, res: Response) => {
    try {
        const { email, password, dispositivo } = req.body;
        console.log('🔵 login - Dispositivo:', dispositivo);

        // 1. Buscar usuario
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        const user = result.rows[0];

        // 2. Verificar contraseña
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        // 3. Verificar estado de la cuenta
        if (user.estado === 'pendiente') {
            return res.status(403).json({
                success: false,
                message: '⏳ Tu cuenta está pendiente de aprobación por el administrador'
            });
        }

        if (user.estado === 'rechazado') {
            return res.status(403).json({
                success: false,
                message: '❌ Tu cuenta ha sido rechazada. Contacta al administrador.'
            });
        }

        // 4. Verificar dispositivo autorizado
        let dispositivoAutorizado = false;
        
        if (dispositivo) {
            // Buscar si el dispositivo ya está registrado
            const dispositivoResult = await pool.query(
                'SELECT * FROM dispositivos WHERE usuario_id = $1 AND huella_dispositivo = $2',
                [user.id, dispositivo.huella]
            );

            if (dispositivoResult.rows.length > 0) {
                // Postgres devuelve booleanos reales, no 1 o 0
                dispositivoAutorizado = dispositivoResult.rows[0].autorizado === true;
                
                // Actualizar último acceso
                await pool.query(
                    'UPDATE dispositivos SET ultimo_acceso = NOW() WHERE id = $1',
                    [dispositivoResult.rows[0].id]
                );
            } else {
                // Nuevo dispositivo - Registrar y solicitar autorización
                await pool.query(
                    `INSERT INTO dispositivos 
                     (usuario_id, nombre_dispositivo, huella_dispositivo, sistema_operativo, navegador, ip, autorizado) 
                     VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
                    [
                        user.id,
                        dispositivo.nombreDispositivo || 'Dispositivo desconocido',
                        dispositivo.huella,
                        dispositivo.sistemaOperativo || 'Desconocido',
                        dispositivo.navegador || 'Desconocido',
                        dispositivo.ip || 'Desconocida'
                    ]
                );
                
                console.log(`📱 Nuevo dispositivo registrado para ${user.nombre} (${user.email})`);
                
                return res.status(403).json({
                    success: false,
                    message: '⏳ Este dispositivo necesita autorización del administrador',
                    requiereAutorizacion: true,
                    dispositivo: {
                        nombre: dispositivo.nombreDispositivo,
                        sistemaOperativo: dispositivo.sistemaOperativo,
                        navegador: dispositivo.navegador,
                        ip: dispositivo.ip
                    }
                });
            }
        }

        // 5. Si el dispositivo no está autorizado
        if (!dispositivoAutorizado) {
            return res.status(403).json({
                success: false,
                message: '⏳ Este dispositivo no está autorizado. Contacta al administrador.'
            });
        }

        // 6. Todo OK - Generar token
        const token = jwt.sign(
            { id: user.id, email: user.email, rol: user.rol },
            process.env['JWT_SECRET'] || 'secret',
            { expiresIn: '7d' }
        );

        // Eliminar la contraseña del objeto antes de enviarlo
        delete user.password;

        return res.json({
            success: true,
            message: 'Login exitoso',
            data: {
                token,
                user,
                dispositivoAutorizado
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al iniciar sesión'
        });
    }
};

// ========== VERIFICAR TOKEN ==========
export const verify = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token no proporcionado'
            });
        }

        const decoded = jwt.verify(token, process.env['JWT_SECRET'] || 'secret') as any;
        
        // Postgres usa $1
        const result = await pool.query(
            'SELECT id, nombre, email, rol, telefono, empresa, estado FROM usuarios WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        return res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
};