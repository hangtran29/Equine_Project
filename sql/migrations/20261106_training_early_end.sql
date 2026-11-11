-- Kết thúc buổi tập sớm hơn dự kiến: lưu lý do (KS03b). Chạy được nhiều lần.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.TrainingResult', 'EarlyEndReason') IS NULL
    ALTER TABLE dbo.TrainingResult ADD EarlyEndReason NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.TrainingResult', 'EarlyEndNote') IS NULL
    ALTER TABLE dbo.TrainingResult ADD EarlyEndNote NVARCHAR(1000) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_TrainingResult_EarlyEnd')
    ALTER TABLE dbo.TrainingResult ADD CONSTRAINT CK_TrainingResult_EarlyEnd CHECK
    (
        EarlyEndReason IS NULL
        OR (EarlyEndReason IN (N'Fatigue', N'Injury', N'Weather', N'Surface', N'Rider', N'Other') AND EarlyEndNote IS NOT NULL)
    );
