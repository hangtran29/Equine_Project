/*
  Sửa lỗi mất dấu tiếng Việt (vd "Cát, đường đất" bị lưu thành "Cát, du?ng d?t").
  Các cột dưới đây do người dùng tự gõ nhưng đang là VARCHAR, SQL Server đổi ký tự ngoài bảng mã Latin thành dấu ?.
  Đổi sang NVARCHAR (Unicode). Script chạy lại nhiều lần vẫn an toàn.
  Lưu ý: dữ liệu ĐÃ bị đổi thành "?" trước đó không khôi phục được, cần nhập lại.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Stall') AND name = 'StallType' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.Stall ALTER COLUMN StallType NVARCHAR(50) NULL;

IF OBJECT_ID('dbo.TrainingPlanTemplateStage') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TrainingPlanTemplateStage') AND name = 'Surface' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.TrainingPlanTemplateStage ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TrainingPlanStage') AND name = 'Surface' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.TrainingPlanStage ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TrainingSession') AND name = 'TrainingType' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.TrainingSession ALTER COLUMN TrainingType NVARCHAR(60) NOT NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TrainingSession') AND name = 'Surface' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.TrainingSession ALTER COLUMN Surface NVARCHAR(50) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DietMeal') AND name = 'Unit' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.DietMeal ALTER COLUMN Unit NVARCHAR(30) NOT NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventoryItem') AND name = 'Unit' AND system_type_id = TYPE_ID('varchar'))
    ALTER TABLE dbo.InventoryItem ALTER COLUMN Unit NVARCHAR(30) NOT NULL;

COMMIT TRANSACTION;
