-- Flow 1 (thiết kế mới): bổ sung cột cho database ĐÃ TẠO từ bản cũ. Database mới chỉ cần chạy horse_v2.sql.
-- Chạy được nhiều lần (cột nào có rồi thì bỏ qua). Không xóa / sửa dữ liệu cũ.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Tài khoản do Manager tạo / cấp lại mật khẩu tạm: phải đổi mật khẩu ở lần đăng nhập đầu
IF COL_LENGTH('dbo.[User]', 'MustChangePassword') IS NULL
    ALTER TABLE dbo.[User] ADD MustChangePassword BIT NOT NULL
        CONSTRAINT DF_User_MustChangePassword DEFAULT 0;

-- Hồ sơ ngựa: ngày rời CLB + 3 ô sức khỏe chủ ngựa tự khai
IF COL_LENGTH('dbo.Horse', 'LeftDate') IS NULL
    ALTER TABLE dbo.Horse ADD LeftDate DATE NULL;
IF COL_LENGTH('dbo.Horse', 'DeclaredHealth') IS NULL
    ALTER TABLE dbo.Horse ADD DeclaredHealth NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Horse', 'MedicalHistory') IS NULL
    ALTER TABLE dbo.Horse ADD MedicalHistory NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Horse', 'OwnerNote') IS NULL
    ALTER TABLE dbo.Horse ADD OwnerNote NVARCHAR(1000) NULL;

-- Chuồng: ngày dự kiến xong bảo trì
IF COL_LENGTH('dbo.Stall', 'MaintenanceUntil') IS NULL
    ALTER TABLE dbo.Stall ADD MaintenanceUntil DATE NULL;

-- Phiếu khám: chỉ số sinh hiệu
IF COL_LENGTH('dbo.MedicalRecord', 'BodyTemperatureC') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD BodyTemperatureC DECIMAL(4,1) NULL;
IF COL_LENGTH('dbo.MedicalRecord', 'HeartRateBpm') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD HeartRateBpm INT NULL;
IF COL_LENGTH('dbo.MedicalRecord', 'RespiratoryRate') IS NULL
    ALTER TABLE dbo.MedicalRecord ADD RespiratoryRate INT NULL;

COMMIT TRANSACTION;
