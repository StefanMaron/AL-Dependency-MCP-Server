table 70000 "Test Item"
{
    DataClassification = CustomerContent;

    fields
    {
        field(1; "No."; Code[20])
        {
            Caption = 'No.';
        }
        field(2; "Description"; Text[100])
        {
            Caption = 'Description';
        }
        field(3; "Unit Price"; Decimal)
        {
            Caption = 'Unit Price';
        }
        field(4; "Blocked"; Boolean)
        {
            Caption = 'Blocked';
        }
    }

    keys
    {
        key(PK; "No.")
        {
            Clustered = true;
        }
    }

    trigger OnInsert()
    begin
    end;
}
