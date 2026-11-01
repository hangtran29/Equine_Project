-- Flow 1 - lịch trực bác sĩ thú y, cho database ĐÃ CÓ dữ liệu (database mới chỉ cần chạy horse_v2.sql).
-- Chạy lại nhiều lần không sao.

IF OBJECT_ID('dbo.VetDutyShift', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VetDutyShift
    (
        VetDutyShiftID INT IDENTITY(1,1) PRIMARY KEY,
        ClubID INT NOT NULL,
        VetID INT NOT NULL,
        DutyDate DATE NOT NULL,
        Shift VARCHAR(20) NOT NULL,
        Note NVARCHAR(500),
        CreatedBy INT NOT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_VetDutyShift_CreatedAt DEFAULT SYSDATETIME(),

        CONSTRAINT FK_VetDutyShift_Club FOREIGN KEY (ClubID)
            REFERENCES dbo.Club(ClubID),
        CONSTRAINT FK_VetDutyShift_Vet FOREIGN KEY (VetID)
            REFERENCES dbo.[User](UserID),
        CONSTRAINT FK_VetDutyShift_CreatedBy FOREIGN KEY (CreatedBy)
            REFERENCES dbo.[User](UserID),
        CONSTRAINT UQ_VetDutyShift UNIQUE (ClubID, DutyDate, Shift, VetID),
        CONSTRAINT CK_VetDutyShift_Shift CHECK
        (
            Shift IN ('Morning', 'Afternoon', 'Night', 'Full Day')
        )
    );
END;
GO
